package mobile

import (
	"bufio"
	"crypto/x509"
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

func TestPiikCookieUpgrade(t *testing.T) {
	for _, mode := range []string{"http", "strict-https", "certificate-exception"} {
		t.Run(mode, func(t *testing.T) {
			secure := mode != "http"
			var remoteOrigin string
			server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/edge/api/share/piik/session":
					http.SetCookie(w, &http.Cookie{Name: "zv_piik_site", Value: "fixture-ticket",
						Path: "/signal", HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: 600})
					io.WriteString(w, `{"success":true}`)
				case "/edge/signaling":
					if _, err := r.Cookie("zv_piik_site"); err == nil {
						t.Error("ticket leaked outside its signal path")
					}
					w.WriteHeader(http.StatusNoContent)
				case "/edge/signal":
					cookie, err := r.Cookie("zv_piik_site")
					if err != nil || cookie.Value != "fixture-ticket" || r.Header.Get("Origin") != remoteOrigin {
						http.Error(w, "site ticket or origin missing", http.StatusForbidden)
						return
					}
					conn, buffered, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					defer conn.Close()
					conn.SetDeadline(time.Now().Add(5 * time.Second))
					fmt.Fprint(buffered, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
					buffered.Flush()
					received := make([]byte, 4)
					if _, err := io.ReadFull(buffered, received); err == nil && string(received) == "ping" {
						io.WriteString(conn, "pong")
					}
				}
			}))
			if secure {
				server.StartTLS()
			} else {
				server.Start()
			}
			defer server.Close()
			remoteOrigin = server.URL
			raw, err := ConfigureServer(server.URL+"/edge", mode == "certificate-exception")
			if err != nil {
				t.Fatal(err)
			}
			defer ConfigureServer("", false)
			var config struct{ URL string }
			if err := json.Unmarshal([]byte(raw), &config); err != nil {
				t.Fatal(err)
			}
			if !strings.HasPrefix(config.URL, "http://127.0.0.1:") {
				t.Fatal("strict HTTPS must share the native cookie repository")
			}
			client := &http.Client{Timeout: 5 * time.Second}
			post := func() *http.Response {
				response, err := client.Post(config.URL+"/api/share/piik/session", "application/json", strings.NewReader(`{"roomId":"fixture"}`))
				if err != nil {
					t.Fatal(err)
				}
				io.Copy(io.Discard, response.Body)
				response.Body.Close()
				return response
			}
			if mode == "strict-https" {
				if post().StatusCode != http.StatusBadGateway {
					t.Fatal("untrusted TLS certificate was accepted")
				}
				connectionMu.Lock()
				roots := x509.NewCertPool()
				roots.AddCert(server.Certificate())
				connectionTransport.TLSClientConfig.RootCAs = roots
				if connectionTransport.TLSClientConfig.InsecureSkipVerify {
					t.Fatal("strict TLS validation was disabled")
				}
				connectionMu.Unlock()
			}
			if response := post(); response.StatusCode != http.StatusOK || response.Header.Get("Set-Cookie") != "" {
				t.Fatal("credential response failed or exposed the HttpOnly ticket")
			}
			response, err := client.Get(config.URL + "/signaling")
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
			local, _ := url.Parse(config.URL)
			conn, err := net.DialTimeout("tcp4", local.Host, 5*time.Second)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			conn.SetDeadline(time.Now().Add(5 * time.Second))
			fmt.Fprintf(conn, "GET %s/signal HTTP/1.1\r\nHost: %s\r\nOrigin: https://localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n", local.Path, local.Host)
			reader := bufio.NewReader(conn)
			upgraded, err := http.ReadResponse(reader, &http.Request{Method: http.MethodGet})
			if err != nil || upgraded.StatusCode != http.StatusSwitchingProtocols {
				t.Fatalf("ticket upgrade failed: %v", err)
			}
			io.WriteString(conn, "ping")
			reply := make([]byte, 4)
			if _, err := io.ReadFull(reader, reply); err != nil || string(reply) != "pong" {
				t.Fatalf("upgraded duplex failed: %v", err)
			}
		})
	}
}
