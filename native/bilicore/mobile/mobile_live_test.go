package mobile

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

const testLiveURL = "https://cn-gotcha01.bilivideo.com/live-bvc/room.flv?expires=1794415262&token=signed-value"

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

type chunkReadCloser struct {
	chunks []string
}

func (reader *chunkReadCloser) Read(buffer []byte) (int, error) {
	if len(reader.chunks) == 0 {
		return 0, io.EOF
	}
	chunk := reader.chunks[0]
	reader.chunks = reader.chunks[1:]
	return copy(buffer, chunk), nil
}

func (reader *chunkReadCloser) Close() error { return nil }

type flushResponseWriter struct {
	header  http.Header
	status  int
	body    bytes.Buffer
	flushes int
}

func newFlushResponseWriter() *flushResponseWriter {
	return &flushResponseWriter{header: make(http.Header)}
}

func (writer *flushResponseWriter) Header() http.Header            { return writer.header }
func (writer *flushResponseWriter) WriteHeader(status int)         { writer.status = status }
func (writer *flushResponseWriter) Write(data []byte) (int, error) { return writer.body.Write(data) }
func (writer *flushResponseWriter) Flush()                         { writer.flushes++ }

func TestAllowedLiveCDN(t *testing.T) {
	cases := []struct {
		name string
		url  string
		want bool
	}{
		{name: "bilivideo https", url: testLiveURL, want: true},
		{name: "bilivideo https port", url: "https://edge.bilivideo.cn:443/live.flv", want: true},
		{name: "plain http", url: "http://edge.bilivideo.com/live.flv"},
		{name: "untrusted host", url: "https://bilivideo.com.attacker.invalid/live.flv"},
		{name: "userinfo", url: "https://user@edge.bilivideo.com/live.flv"},
		{name: "nonstandard port", url: "https://edge.bilivideo.net:444/live.flv"},
		{name: "vod edge host", url: "https://edge.mountaintoys.cn/live.flv"},
		{name: "fragment", url: "https://edge.bilivideo.com/live.flv#fragment"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			if got := allowedLiveCDN(test.url); got != test.want {
				t.Fatalf("allowedLiveCDN(%q) = %v, want %v", test.url, got, test.want)
			}
		})
	}
}

func TestAuthorizeLivePreservesSignedTarget(t *testing.T) {
	proxy := &session{base: "http://127.0.0.1:32100/random-token", liveTargets: map[string]struct{}{}}
	request := httptest.NewRequest(http.MethodGet, "/authorize-live?url="+url.QueryEscape(testLiveURL), nil)
	response := httptest.NewRecorder()
	proxy.authorizeLive(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("authorization status = %d, want %d", response.Code, http.StatusOK)
	}
	var payload struct {
		Success  bool   `json:"success"`
		ProxyURL string `json:"proxyUrl"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(payload.ProxyURL)
	if err != nil {
		t.Fatal(err)
	}
	if !payload.Success || parsed.Path != "/random-token/proxy" ||
		parsed.Query().Get("url") != testLiveURL || parsed.Query().Get("ref") != "live" {
		t.Fatalf("unexpected authorization response: %+v", payload)
	}
	if _, ok := proxy.liveTargets[testLiveURL]; !ok {
		t.Fatal("authorized signed target was not registered")
	}
}

func TestProxyRequiresLiveAuthorizationAndRef(t *testing.T) {
	proxy := &session{targets: map[string][]string{}, liveTargets: map[string]struct{}{testLiveURL: {}}}
	for _, rawURL := range []string{
		"/proxy?url=" + url.QueryEscape(testLiveURL),
		"/proxy?url=" + url.QueryEscape("https://edge.bilivideo.com/live.flv") + "&ref=live",
	} {
		request := httptest.NewRequest(http.MethodGet, rawURL, nil)
		response := httptest.NewRecorder()
		proxy.proxy(response, request)
		if response.Code != http.StatusForbidden {
			t.Fatalf("proxy(%q) status = %d, want %d", rawURL, response.Code, http.StatusForbidden)
		}
	}
}

func TestLiveProxyHeadersCookieIsolationAndStreaming(t *testing.T) {
	previous := liveStreamClient
	t.Cleanup(func() { liveStreamClient = previous })
	var requestHeaders http.Header
	liveStreamClient = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requestHeaders = request.Header.Clone()
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       &chunkReadCloser{chunks: []string{"FLV", "-chunk"}},
			Request:    request,
		}, nil
	})}
	proxy := &session{targets: map[string][]string{}, liveTargets: map[string]struct{}{testLiveURL: {}}}
	request := httptest.NewRequest(http.MethodGet, "/proxy?url="+url.QueryEscape(testLiveURL)+"&ref=live", nil)
	response := newFlushResponseWriter()
	proxy.proxy(response, request)
	if response.status != http.StatusOK || response.body.String() != "FLV-chunk" || response.flushes != 2 {
		t.Fatalf("status/body/flushes = %d/%q/%d", response.status, response.body.String(), response.flushes)
	}
	if response.header.Get("Content-Type") != "video/x-flv" {
		t.Fatalf("live content type = %q", response.header.Get("Content-Type"))
	}
	if requestHeaders.Get("Referer") != "https://live.bilibili.com" ||
		requestHeaders.Get("Origin") != "https://live.bilibili.com" ||
		requestHeaders.Get("Accept") != "*/*" || requestHeaders.Get("Cookie") != "" {
		t.Fatalf("unexpected upstream headers: %v", requestHeaders)
	}
	if liveStreamClient.Timeout != 0 {
		t.Fatalf("live proxy total timeout = %v, want none", liveStreamClient.Timeout)
	}
}

func TestLiveProxyCancelsUpstreamWithClient(t *testing.T) {
	previous := liveStreamClient
	started := make(chan struct{})
	liveStreamClient = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		close(started)
		<-request.Context().Done()
		return nil, request.Context().Err()
	})}
	t.Cleanup(func() { liveStreamClient = previous })
	proxy := &session{targets: map[string][]string{}, liveTargets: map[string]struct{}{testLiveURL: {}}}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		request := httptest.NewRequest(http.MethodGet, "/proxy?url="+url.QueryEscape(testLiveURL)+"&ref=live", nil).WithContext(ctx)
		proxy.proxy(httptest.NewRecorder(), request)
	}()
	<-started
	cancel()
	<-done
}

func TestLiveRedirectPolicyKeepsHeadersAndHostAllowlist(t *testing.T) {
	previous := liveStreamClient.CheckRedirect
	t.Cleanup(func() { liveStreamClient.CheckRedirect = previous })
	accepted := httptest.NewRequest(http.MethodGet, "https://edge2.bilivideo.com/live.flv", nil)
	via := []*http.Request{httptest.NewRequest(http.MethodGet, testLiveURL, nil)}
	if err := liveStreamClient.CheckRedirect(accepted, via); err != nil {
		t.Fatalf("trusted CDN redirect rejected: %v", err)
	}
	if accepted.Header.Get("Referer") != "https://live.bilibili.com" || accepted.Header.Get("Origin") != "https://live.bilibili.com" {
		t.Fatalf("redirect lost live headers: %v", accepted.Header)
	}
	denied := httptest.NewRequest(http.MethodGet, "https://attacker.invalid/live.flv", nil)
	if err := liveStreamClient.CheckRedirect(denied, via); err == nil {
		t.Fatal("untrusted redirect was accepted")
	}
}

func TestCopyStreamingFlushesEachRead(t *testing.T) {
	writer := newFlushResponseWriter()
	copyStreaming(writer, &chunkReadCloser{chunks: []string{"first", "second"}})
	if writer.body.String() != "firstsecond" || writer.flushes != 2 {
		t.Fatalf("body/flushes = %q/%d", writer.body.String(), writer.flushes)
	}
}

func TestAuthorizeLiveRejectsNonBilibiliURL(t *testing.T) {
	proxy := &session{base: "http://127.0.0.1:32100/random-token"}
	request := httptest.NewRequest(http.MethodGet, "/authorize-live?url="+url.QueryEscape("https://attacker.invalid/live.flv"), nil)
	response := httptest.NewRecorder()
	proxy.authorizeLive(response, request)
	if response.Code != http.StatusBadRequest || strings.Contains(response.Body.String(), "proxyUrl") {
		t.Fatalf("invalid target response = %d %s", response.Code, response.Body.String())
	}
}

func TestHostMediaRegistration(t *testing.T) {
	if _, err := Start(""); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(Stop)
	version := agent.epoch
	video := "https://cdn.bilivideo.com/video.m4s?sign=a%2Bb"
	audio := "https://cdn.bilivideo.com/audio.m4s?sign=c%2Fd"
	if err := RegisterHostMedia(video, "https://invalid.example/audio", version); err == nil {
		t.Fatal("accepted invalid audio")
	}
	if _, ok := agent.targets[video]; ok {
		t.Fatal("registered only half of the pair")
	}
	if err := RegisterHostMedia(video, audio, version); err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{video, audio} {
		if _, ok := agent.targets[target]; !ok {
			t.Fatal("missing signed stream")
		}
	}
	Logout()
	if err := RegisterHostMedia(video, audio, version); err == nil || len(agent.targets) != 0 {
		t.Fatal("restored streams from a previous session")
	}
}
