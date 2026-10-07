package mobile

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"time"
)

var connectionMu sync.Mutex
var connectionServer *http.Server
var connectionTransport *http.Transport
var connectionSockets = map[net.Conn]bool{}

func serverURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, fmt.Errorf("服务器地址无效")
	}
	return u, nil
}

func stopConnectionLocked() {
	if connectionServer != nil {
		connectionServer.Close()
		connectionServer = nil
	}
	if connectionTransport != nil {
		connectionTransport.CloseIdleConnections()
		connectionTransport = nil
	}
	for conn := range connectionSockets {
		conn.Close()
	}
	connectionSockets = map[net.Conn]bool{}
}

// Each transport has a single immutable origin. Never install a global TLS exception.
func ConfigureServer(raw string, allow bool) (string, error) {
	target, err := serverURL(raw)
	if err != nil {
		return "", err
	}
	connectionMu.Lock()
	defer connectionMu.Unlock()
	stopConnectionLocked()
	if !allow {
		return asJSON(map[string]any{"url": raw}), nil
	}
	if target.Scheme != "https" {
		return "", fmt.Errorf("证书例外仅适用于 HTTPS")
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	token := make([]byte, 24)
	if _, err = rand.Read(token); err != nil {
		listener.Close()
		return "", err
	}
	prefix := "/" + hex.EncodeToString(token)
	origin := target.Scheme + "://" + target.Host
	local := "http://" + listener.Addr().String() + prefix
	jar, _ := cookiejar.New(nil)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	// Safe only because Director binds every request to target and never follows redirects.
	transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12, InsecureSkipVerify: true}
	transport.ResponseHeaderTimeout = 30 * time.Second
	proxy := &httputil.ReverseProxy{Transport: transport, FlushInterval: -1, ErrorHandler: func(w http.ResponseWriter, r *http.Request, e error) {
		if requestOrigin, _ := r.Context().Value(localOriginKey{}).(string); requestOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", requestOrigin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		http.Error(w, "服务器连接失败", 502)
	}}
	proxy.Director = func(r *http.Request) {
		r.URL.Scheme = target.Scheme
		r.URL.Host = target.Host
		r.Host = target.Host
		r.URL.Path = strings.TrimPrefix(r.URL.Path, prefix)
		if r.URL.RawPath != "" {
			r.URL.RawPath = strings.TrimPrefix(r.URL.RawPath, prefix)
		}
		r.Header.Del("Cookie")
		for _, cookie := range jar.Cookies(r.URL) {
			r.AddCookie(cookie)
		}
		if r.Header.Get("Origin") != "" {
			r.Header.Set("Origin", origin)
		}
		r.Header.Set("Referer", origin+"/")
		r.Header.Del("X-Forwarded-Host")
		r.Header.Del("X-Forwarded-For")
		r.Header.Set("X-Forwarded-Proto", target.Scheme)
	}
	proxy.ModifyResponse = func(res *http.Response) error {
		jar.SetCookies(res.Request.URL, res.Cookies())
		res.Header.Del("Set-Cookie")
		if location := res.Header.Get("Location"); location != "" {
			destination, err := res.Request.URL.Parse(location)
			if err != nil {
				return err
			}
			if destination.Scheme == "http" && destination.Host == target.Host {
				return fmt.Errorf("HTTPS 降级重定向已拒绝")
			}
			if destination.Scheme == target.Scheme && destination.Host == target.Host {
				res.Header.Set("Location", local+destination.RequestURI())
			}
		}
		res.Header.Del("Access-Control-Allow-Origin")
		res.Header.Del("Access-Control-Allow-Credentials")
		if requestOrigin, _ := res.Request.Context().Value(localOriginKey{}).(string); requestOrigin != "" {
			res.Header.Set("Access-Control-Allow-Origin", requestOrigin)
			res.Header.Set("Access-Control-Allow-Credentials", "true")
			res.Header.Add("Vary", "Origin")
		}
		res.Header.Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Content-Type")
		return nil
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestOrigin := r.Header.Get("Origin")
		if r.Host != listener.Addr().String() || !strings.HasPrefix(r.URL.Path, prefix+"/") || r.URL.IsAbs() || (requestOrigin != "" && requestOrigin != "https://localhost" && requestOrigin != "http://localhost") {
			http.Error(w, "连接通道拒绝请求", 403)
			return
		}
		if requestOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", requestOrigin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", r.Header.Get("Access-Control-Request-Headers"))
			w.WriteHeader(204)
			return
		}
		r.Header.Del("X-ZViewer-Local-Origin")
		r = r.WithContext(context.WithValue(r.Context(), localOriginKey{}, requestOrigin))
		// ReverseProxy appends response headers to w; avoid duplicate CORS values.
		w.Header().Del("Access-Control-Allow-Origin")
		w.Header().Del("Access-Control-Allow-Credentials")
		w.Header().Del("Vary")
		proxy.ServeHTTP(w, r)
	})
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second}
	server.ConnState = func(conn net.Conn, state http.ConnState) {
		connectionMu.Lock()
		defer connectionMu.Unlock()
		if state == http.StateClosed {
			delete(connectionSockets, conn)
		} else {
			connectionSockets[conn] = true
		}
	}
	connectionServer = server
	connectionTransport = transport
	go server.Serve(listener)
	return asJSON(map[string]any{"url": local + strings.TrimRight(target.EscapedPath(), "/"), "origin": origin}), nil
}

// Probe has no jar, Authorization or redirect following. Classification gates HTTP fallback.
func ProbeServer(raw string) (string, error) {
	target, err := serverURL(raw)
	if err != nil {
		return "", err
	}
	target.Path = strings.TrimRight(target.Path, "/") + "/api/auth/public-settings"
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		code := "network"
		var unknown x509.UnknownAuthorityError
		var invalid x509.CertificateInvalidError
		var hostname x509.HostnameError
		var record tls.RecordHeaderError
		var op *net.OpError
		switch {
		case errors.As(err, &unknown):
			code = "certificate_untrusted"
		case errors.As(err, &hostname):
			code = "certificate_hostname"
		case errors.As(err, &invalid):
			code = "certificate_invalid"
		case errors.As(err, &record) || strings.Contains(err.Error(), "HTTP response to HTTPS client"):
			code = "tls_unavailable"
		case errors.As(err, &op) && strings.Contains(strings.ToLower(op.Error()), "refused"):
			code = "port_unavailable"
		case errors.Is(err, context.DeadlineExceeded):
			code = "timeout"
		}
		return asJSON(map[string]any{"ok": false, "code": code}), nil
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 65536))
	var payload struct {
		Success  bool `json:"success"`
		Settings *struct {
			RoomCreationMode string `json:"roomCreationMode"`
			RegistrationMode string `json:"registrationMode"`
		} `json:"settings"`
	}
	err = json.Unmarshal(body, &payload)
	return asJSON(map[string]any{"ok": response.StatusCode == 200 && err == nil && payload.Success && payload.Settings != nil && (payload.Settings.RoomCreationMode != "" || payload.Settings.RegistrationMode != ""), "code": "response", "status": response.StatusCode}), nil
}

type localOriginKey struct{}
