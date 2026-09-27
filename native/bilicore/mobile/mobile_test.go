package mobile

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

type mediaTransport func(*http.Request) (*http.Response, error)

func (f mediaTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestProxyRangeBackupAndHead(t *testing.T) {
	primary, backup := "https://test.bilivideo.com/primary", "https://test.bilivideo.com/backup"
	a := &session{targets: map[string][]string{primary: {backup}}}
	previous := streamClient
	defer func() { streamClient = previous }()
	requests := []string{}
	streamClient = &http.Client{Transport: mediaTransport(func(r *http.Request) (*http.Response, error) {
		requests = append(requests, r.Method+" "+r.URL.Path)
		if r.Header.Get("Range") != "bytes=2-5" || r.Header.Get("Referer") != "https://www.bilibili.com/" {
			t.Fatal("range or referer lost")
		}
		if r.URL.Path == "/primary" {
			return &http.Response{StatusCode: 403, Body: io.NopCloser(strings.NewReader("denied")), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: 206, Body: io.NopCloser(strings.NewReader("2345")), Header: http.Header{"Content-Range": {"bytes 2-5/8"}, "Accept-Ranges": {"bytes"}, "Content-Length": {"4"}}}, nil
	})}
	for _, method := range []string{"GET", "HEAD"} {
		req := httptest.NewRequest(method, "http://localhost/proxy?url="+url.QueryEscape(primary), nil)
		req.Header.Set("Range", "bytes=2-5")
		res := httptest.NewRecorder()
		a.proxy(res, req)
		if res.Code != 206 || res.Header().Get("Content-Range") != "bytes 2-5/8" {
			t.Fatal("partial response lost")
		}
	}
	if strings.Join(requests, ",") != "GET /primary,GET /backup,HEAD /primary,HEAD /backup" {
		t.Fatal(requests)
	}
}

func TestLifecycleAndAccessBoundary(t *testing.T) {
	Stop()
	defer Stop()
	status, err := Start("")
	if err != nil {
		t.Fatal(err)
	}
	var state struct {
		ProxyURL string `json:"proxyUrl"`
		Ready    bool   `json:"ready"`
	}
	json.Unmarshal([]byte(status), &state)
	if !state.Ready || !strings.HasPrefix(state.ProxyURL, "http://127.0.0.1:") {
		t.Fatal("not loopback")
	}
	res, err := http.Get(state.ProxyURL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatal(res.StatusCode)
	}
	second, _ := Start("")
	if second != status {
		t.Fatal("start should be idempotent")
	}
	req, _ := http.NewRequest("GET", state.ProxyURL+"/health", nil)
	req.Header.Set("Origin", "https://untrusted.example")
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatal("foreign origin accepted")
	}
	res, err = http.Get(state.ProxyURL + "/proxy?url=https://127.0.0.1/private")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatal("unissued target accepted")
	}
	Stop()
	if strings.Contains(Status(), `"ready":true`) {
		t.Fatal("stop left service running")
	}
}
func TestCDNTargetValidation(t *testing.T) {
	for _, u := range []string{"https://evilbilivideo.com/x", "https://test.bilivideo.com@127.0.0.1/x", "file:///etc/passwd", "http://127.0.0.1/x", "https://test.bilivideo.com:8080/x"} {
		if allowedCDN(u) {
			t.Fatalf("accepted %s", u)
		}
	}
	if !allowedCDN("https://cn.test.bilivideo.com/x") {
		t.Fatal("valid CDN rejected")
	}
}
func TestPreflightAndMethod(t *testing.T) {
	handler := originGuard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	req := httptest.NewRequest("OPTIONS", "http://localhost/test", nil)
	req.Header.Set("Origin", "https://localhost")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != 204 || res.Header().Get("Access-Control-Allow-Origin") != "https://localhost" {
		t.Fatal("preflight failed")
	}
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest("POST", "http://localhost/test", nil))
	if res.Code != 405 {
		t.Fatal("unexpected method accepted")
	}
}
