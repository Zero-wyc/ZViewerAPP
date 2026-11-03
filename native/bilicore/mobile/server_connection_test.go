package mobile

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func ipv6TestServer(t *testing.T, secure bool) *httptest.Server {
	t.Helper()
	listener, err := net.Listen("tcp6", "[::1]:0")
	if err != nil {
		t.Skipf("IPv6 loopback unavailable: %v", err)
	}
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Upstream-Host", r.Host)
		w.Header().Set("X-Upstream-Origin", r.Header.Get("Origin"))
		switch r.URL.Path {
		case "/edge/api/auth/public-settings":
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, `{"success":true,"settings":{"registrationMode":"open"}}`)
		case "/edge/media":
			if r.Header.Get("Range") != "bytes=0-3" || r.URL.RawQuery != "id=1" {
				http.Error(w, "range or query lost", http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Range", "bytes 0-3/8")
			w.Header().Set("Accept-Ranges", "bytes")
			w.WriteHeader(http.StatusPartialContent)
			io.WriteString(w, "data")
		case "/edge/socket.io/":
			if r.Header.Get("Upgrade") != "websocket" || r.URL.Query().Get("transport") != "websocket" {
				http.Error(w, "upgrade lost", http.StatusBadRequest)
				return
			}
			connection, buffered, err := w.(http.Hijacker).Hijack()
			if err != nil {
				t.Errorf("hijack: %v", err)
				return
			}
			defer connection.Close()
			connection.SetDeadline(time.Now().Add(5 * time.Second))
			fmt.Fprint(buffered, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
			buffered.Flush()
			message := make([]byte, 4)
			if _, err := io.ReadFull(buffered, message); err != nil {
				t.Errorf("upgraded request: %v", err)
				return
			}
			if string(message) != "ping" {
				t.Errorf("upgraded request = %q", message)
				return
			}
			io.WriteString(connection, "pong")
		default:
			http.NotFound(w, r)
		}
	}))
	server.Listener.Close()
	server.Listener = listener
	if secure {
		server.StartTLS()
	} else {
		server.Start()
	}
	t.Cleanup(server.Close)
	return server
}

func TestIPv6ServerConnection(t *testing.T) {
	for _, secure := range []bool{false, true} {
		name := "HTTP"
		if secure {
			name = "HTTPSCertificateException"
		}
		t.Run(name, func(t *testing.T) {
			server := ipv6TestServer(t, secure)
			target := server.URL + "/edge"
			raw, err := ConfigureServer(target, secure)
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { ConfigureServer("", false) })
			var configured struct {
				URL    string `json:"url"`
				Origin string `json:"origin"`
			}
			if err := json.Unmarshal([]byte(raw), &configured); err != nil {
				t.Fatal(err)
			}
			if configured.Origin != server.URL || !strings.HasSuffix(configured.URL, "/edge") {
				t.Fatalf("origin or prefix changed: %s", raw)
			}
			client := &http.Client{Transport: &http.Transport{}, Timeout: 5 * time.Second}
			t.Cleanup(client.CloseIdleConnections)
			request, _ := http.NewRequest(http.MethodGet, configured.URL+"/media?id=1", nil)
			request.Header.Set("Origin", "https://localhost")
			request.Header.Set("Range", "bytes=0-3")
			response, err := client.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			body, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			if response.StatusCode != http.StatusPartialContent || string(body) != "data" || response.Header.Get("Content-Range") != "bytes 0-3/8" {
				t.Fatalf("range response: status=%d body=%q headers=%v", response.StatusCode, body, response.Header)
			}
			if response.Header.Get("X-Upstream-Host") != server.Listener.Addr().String() || response.Header.Get("X-Upstream-Origin") != server.URL {
				t.Fatalf("IPv6 Host/Origin changed: %v", response.Header)
			}
			if response.Header.Get("Access-Control-Allow-Origin") != "https://localhost" {
				t.Fatalf("local CORS origin changed: %v", response.Header)
			}

			local, _ := url.Parse(configured.URL)
			connection, err := net.DialTimeout("tcp4", local.Host, 5*time.Second)
			if err != nil {
				t.Fatal(err)
			}
			defer connection.Close()
			connection.SetDeadline(time.Now().Add(5 * time.Second))
			fmt.Fprintf(connection, "GET %s/socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: %s\r\nOrigin: https://localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n", local.Path, local.Host)
			reader := bufio.NewReader(connection)
			upgraded, err := http.ReadResponse(reader, &http.Request{Method: http.MethodGet})
			if err != nil {
				t.Fatal(err)
			}
			if upgraded.StatusCode != http.StatusSwitchingProtocols {
				t.Fatalf("upgrade status = %d", upgraded.StatusCode)
			}
			io.WriteString(connection, "ping")
			message := make([]byte, 4)
			if _, err := io.ReadFull(reader, message); err != nil || string(message) != "pong" {
				t.Fatalf("IPv6 upgraded duplex response = %q, err=%v", message, err)
			}

			probe, err := ProbeServer(target)
			if err != nil {
				t.Fatal(err)
			}
			var result struct {
				OK   bool   `json:"ok"`
				Code string `json:"code"`
			}
			if err := json.Unmarshal([]byte(probe), &result); err != nil {
				t.Fatal(err)
			}
			if secure {
				if result.OK || result.Code != "certificate_untrusted" {
					t.Fatalf("probe must still verify the selected self-signed IPv6 server: %s", probe)
				}
			} else if !result.OK {
				t.Fatalf("IPv6 HTTP public probe failed: %s", probe)
			}
		})
	}
}
