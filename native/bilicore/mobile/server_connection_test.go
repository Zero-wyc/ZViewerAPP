package mobile

import (
	"bufio"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func connectionResult(t *testing.T, raw string, allow bool) string {
	t.Helper()
	data, err := ConfigureServer(raw, allow)
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		URL string `json:"url"`
	}
	if err = json.Unmarshal([]byte(data), &result); err != nil {
		t.Fatal(err)
	}
	return result.URL
}
func TestScopedTLSStreamCookiesRangeAndRevocation(t *testing.T) {
	remote := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/auth/public-settings" {
			if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
				t.Error("probe sent credentials")
			}
			io.WriteString(w, `{"success":true,"settings":{"roomCreationMode":"all"}}`)
			return
		}
		if r.Header.Get("X-ZViewer-Local-Origin") != "" {
			t.Error("internal header leaked")
		}
		switch r.URL.Path {
		case "/login":
			http.SetCookie(w, &http.Cookie{Name: "private", Value: "native-only", Path: "/", Secure: true, HttpOnly: true})
			io.WriteString(w, "login")
		case "/cookie":
			if c, err := r.Cookie("private"); err != nil || c.Value != "native-only" {
				t.Error("native cookie missing")
			}
			io.WriteString(w, "cookie")
		case "/range":
			if r.Header.Get("Range") != "bytes=2-5" {
				t.Error("Range missing")
			}
			w.Header().Set("Content-Range", "bytes 2-5/10")
			w.WriteHeader(206)
			io.WriteString(w, "2345")
		case "/stream":
			w.Header().Set("Content-Type", "application/x-ndjson")
			io.WriteString(w, "first\n")
			w.(http.Flusher).Flush()
			<-r.Context().Done()
		default:
			http.NotFound(w, r)
		}
	}))
	defer remote.Close()
	probe, err := ProbeServer(remote.URL)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(probe, "certificate_untrusted") {
		t.Fatalf("strict validation weakened %s", probe)
	}
	local := connectionResult(t, remote.URL, true)
	t.Cleanup(func() { ConfigureServer(remote.URL, false) })
	request := func(path string) *http.Response {
		t.Helper()
		req, _ := http.NewRequest("GET", local+path, nil)
		req.Header.Set("Origin", "https://localhost")
		req.Header.Set("Cookie", "browser=must-not-leak")
		if path == "/range" {
			req.Header.Set("Range", "bytes=2-5")
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	login := request("/login")
	if got := login.Header.Values("Access-Control-Allow-Origin"); len(got) != 1 || got[0] != "https://localhost" {
		t.Fatalf("invalid browser CORS values: %v", got)
	}
	io.Copy(io.Discard, login.Body)
	login.Body.Close()
	if login.Header.Get("Set-Cookie") != "" {
		t.Fatal("cookie exposed to JS")
	}
	cookie := request("/cookie")
	cookie.Body.Close()
	ranged := request("/range")
	body, _ := io.ReadAll(ranged.Body)
	ranged.Body.Close()
	if ranged.StatusCode != 206 || string(body) != "2345" || ranged.Header.Get("Content-Range") != "bytes 2-5/10" {
		t.Fatal("Range contract failed")
	}
	bad, _ := http.NewRequest("GET", local+"/range", nil)
	bad.Header.Set("Origin", "https://evil.test")
	denied, err := http.DefaultClient.Do(bad)
	if err != nil {
		t.Fatal(err)
	}
	denied.Body.Close()
	if denied.StatusCode != 403 {
		t.Fatal("foreign origin allowed")
	}
	stream := request("/stream")
	reader := bufio.NewReader(stream.Body)
	first, err := reader.ReadString('\n')
	if err != nil || first != "first\n" {
		t.Fatal("stream buffered until completion")
	}
	connectionResult(t, remote.URL, false)
	finished := make(chan struct{})
	go func() { io.Copy(io.Discard, stream.Body); stream.Body.Close(); close(finished) }()
	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("revocation left stream alive")
	}
	if _, err = http.Get(local + "/range"); err == nil {
		t.Fatal("revoked channel still active")
	}
}
func TestTLSWebSocketUpgradeAndRevoke(t *testing.T) {
	remote := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			http.Error(w, "not upgrade", 400)
			return
		}
		c, b, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer c.Close()
		b.WriteString("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
		b.Flush()
		io.Copy(c, c)
	}))
	defer remote.Close()
	local := connectionResult(t, remote.URL, true)
	u, _ := url.Parse(local + "/socket.io/?transport=websocket")
	c, err := net.DialTimeout("tcp", u.Host, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	c.SetDeadline(time.Now().Add(2 * time.Second))
	io.WriteString(c, "GET "+u.RequestURI()+" HTTP/1.1\r\nHost: "+u.Host+"\r\nOrigin: https://localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
	reader := bufio.NewReader(c)
	res, err := http.ReadResponse(reader, nil)
	if err != nil || res.StatusCode != 101 {
		t.Fatalf("upgrade failed %v", err)
	}
	frame := []byte{0x81, 0x04, 't', 'e', 's', 't'}
	c.Write(frame)
	got := make([]byte, len(frame))
	if _, err = io.ReadFull(reader, got); err != nil || string(got) != string(frame) {
		t.Fatal("duplex frame failed")
	}
	connectionResult(t, remote.URL, false)
	if _, err = reader.ReadByte(); err == nil {
		t.Fatal("revocation left WS alive")
	}
}
func TestProtocolProbeAndPrivateOrigin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Error("probe credential leak")
		}
		io.WriteString(w, `{"success":true,"settings":{"registrationMode":"open"}}`)
	}))
	defer server.Close()
	ok, _ := ProbeServer(server.URL)
	if !strings.Contains(ok, `"ok":true`) {
		t.Fatal(ok)
	}
	tls, _ := ProbeServer(strings.Replace(server.URL, "http:", "https:", 1))
	if !strings.Contains(tls, "tls_unavailable") {
		t.Fatal(tls)
	}
	for _, raw := range []string{"https://user:pass@host", "https://host?x=1", "ftp://host"} {
		if _, err := ConfigureServer(raw, true); err == nil {
			t.Error("accepted invalid server")
		}
	}
}
