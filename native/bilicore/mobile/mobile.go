// Package mobile exposes only gomobile-compatible control methods. Media bytes
// stay on loopback HTTP and never travel through the JavaScript bridge.
package mobile

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
	"zviewer.local/bilicore/core"
)

type session struct {
	mu           sync.RWMutex
	server       *http.Server
	base, cookie string
	epoch        int
	user         *core.UserValidation
	targets      map[string][]string
}

var agent = &session{targets: map[string][]string{}}

func asJSON(v any) string { b, _ := json.Marshal(v); return string(b) }

func Status() string {
	agent.mu.RLock()
	defer agent.mu.RUnlock()
	return asJSON(map[string]any{"supported": true, "ready": agent.server != nil, "loggedIn": agent.cookie != "" && agent.user != nil && agent.user.Valid, "proxyUrl": agent.base, "sessionVersion": agent.epoch, "user": agent.user})
}

func Start(cookie string) (string, error) {
	agent.mu.Lock()
	if agent.server == nil {
		listener, err := net.Listen("tcp4", "127.0.0.1:0")
		if err != nil {
			agent.mu.Unlock()
			return "", err
		}
		token := make([]byte, 24)
		if _, err = rand.Read(token); err != nil {
			listener.Close()
			agent.mu.Unlock()
			return "", err
		}
		prefix := "/" + hex.EncodeToString(token)
		agent.base = "http://" + listener.Addr().String() + prefix
		mux := http.NewServeMux()
		mux.HandleFunc(prefix+"/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, `{"ok":true}`)
		})
		mux.HandleFunc(prefix+"/resolve", agent.resolve)
		mux.HandleFunc(prefix+"/proxy", agent.proxy)
		agent.server = &http.Server{Handler: originGuard(mux), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
		server := agent.server
		go server.Serve(listener)
	}
	agent.mu.Unlock()
	if cookie != "" {
		if _, err := SetCookie(cookie); err != nil {
			return Status(), nil
		}
	}
	return Status(), nil
}

func Stop() {
	agent.mu.Lock()
	server := agent.server
	agent.server = nil
	agent.base = ""
	agent.cookie = ""
	agent.user = nil
	agent.epoch++
	agent.targets = map[string][]string{}
	agent.mu.Unlock()
	if server != nil {
		server.Close()
	}
}

func SetCookie(cookie string) (string, error) {
	user, err := core.ValidateCookie(cookie)
	if err != nil {
		return "", err
	}
	if !user.Valid {
		return "", fmt.Errorf("B站登录已失效，请重新登录")
	}
	agent.mu.Lock()
	agent.cookie = cookie
	agent.user = user
	agent.epoch++
	agent.targets = map[string][]string{}
	agent.mu.Unlock()
	core.ResetSessionCaches()
	return Status(), nil
}

func Logout() string {
	core.ResetSessionCaches()
	agent.mu.Lock()
	agent.cookie = ""
	agent.user = nil
	agent.epoch++
	agent.targets = map[string][]string{}
	agent.mu.Unlock()
	return Status()
}
func QR() (string, error) {
	qr, err := core.GenerateQR()
	if err != nil {
		return "", err
	}
	return asJSON(qr), nil
}

// This cookie-bearing response is native-only. The Capacitor plugin removes
// cookie before returning the login result to the frontend.
func PollQR(key string) (string, error) {
	r, err := core.PollQR(key)
	if err != nil {
		return "", err
	}
	return asJSON(r), nil
}

func originGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && origin != "https://localhost" && origin != "http://localhost" {
			http.Error(w, "origin denied", http.StatusForbidden)
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Range, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func apiError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	code := http.StatusBadGateway
	if e, ok := err.(*core.ResolveError); ok && e.Code == "NOT_LOGGED_IN" {
		code = http.StatusUnauthorized
	}
	w.WriteHeader(code)
	io.WriteString(w, asJSON(map[string]any{"success": false, "message": err.Error()}))
}

func (a *session) resolve(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	cookie, epoch := a.cookie, a.epoch
	a.mu.RUnlock()
	q := r.URL.Query()
	cid, _ := strconv.ParseInt(q.Get("cid"), 10, 64)
	qn, _ := strconv.Atoi(q.Get("qn"))
	fallback, _ := strconv.Atoi(q.Get("fallbackQn"))
	var caps []core.Capability
	if err := json.Unmarshal([]byte(q.Get("capabilities")), &caps); err != nil && q.Get("capabilities") != "" {
		apiError(w, fmt.Errorf("设备能力参数无效"))
		return
	}
	mode := q.Get("qualityMode")
	if mode == "" {
		mode = "autoMax"
	}
	if mode != "autoMax" && mode != "manual" {
		apiError(w, fmt.Errorf("画质模式无效"))
		return
	}
	budget := 45 * time.Second
	if requested, _ := strconv.Atoi(q.Get("timeoutMs")); requested > 0 && time.Duration(requested)*time.Millisecond < budget {
		budget = time.Duration(requested) * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(r.Context(), budget)
	defer cancel()
	result, err := core.ResolveMobile(ctx, core.ResolveOptions{Url: q.Get("bvid"), Cid: cid, Qn: qn, Cookie: cookie, QualityMode: mode, Capabilities: caps, FallbackQn: fallback, ForceDash: true})
	if err != nil {
		apiError(w, err)
		return
	}
	a.mu.Lock()
	if a.epoch != epoch {
		a.mu.Unlock()
		apiError(w, fmt.Errorf("账号已切换，请重新解析"))
		return
	}
	a.targets[result.VideoUrl] = result.VideoBackupUrls
	a.targets[result.AudioUrl] = result.AudioBackupUrls
	a.mu.Unlock()
	reason := ""
	if mode == "autoMax" && result.CurrentQn < 80 {
		reason = "high_quality_unavailable"
	}
	if fallback > 0 {
		reason = "playback_failed"
	}
	w.Header().Set("Content-Type", "application/json")
	// Result URLs remain upstream URLs; the frontend adds its local token URL.
	b, _ := json.Marshal(result)
	var data map[string]any
	json.Unmarshal(b, &data)
	data["success"] = true
	data["qualityMode"] = mode
	data["requestedQn"] = qn
	data["selectedQn"] = result.CurrentQn
	data["fallbackReason"] = reason
	json.NewEncoder(w).Encode(data)
}

func allowedCDN(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return false
	}
	h := strings.ToLower(u.Hostname())
	return (strings.HasSuffix(h, ".bilivideo.com") || strings.HasSuffix(h, ".bilivideo.cn") || strings.HasSuffix(h, ".bilivideo.net")) && (u.Port() == "" || u.Port() == "443" || u.Port() == "80")
}

var streamClient = &http.Client{
	Transport: &http.Transport{Proxy: nil, ResponseHeaderTimeout: 10 * time.Second, IdleConnTimeout: 30 * time.Second, MaxIdleConns: 16, MaxIdleConnsPerHost: 8},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 5 || !allowedCDN(req.URL.String()) {
			return fmt.Errorf("CDN redirect denied")
		}
		return nil
	},
}

func (a *session) proxy(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("url")
	a.mu.RLock()
	backups, issued := a.targets[target]
	a.mu.RUnlock()
	if !issued || !allowedCDN(target) {
		http.Error(w, "unissued media URL", http.StatusForbidden)
		return
	}
	candidates := append([]string{target}, backups...)
	for i, u := range candidates {
		if !allowedCDN(u) {
			continue
		}
		req, err := http.NewRequestWithContext(r.Context(), r.Method, u, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0")
		req.Header.Set("Referer", "https://www.bilibili.com/")
		req.Header.Set("Origin", "https://www.bilibili.com")
		req.Header.Set("Range", r.Header.Get("Range"))
		res, err := streamClient.Do(req)
		if err != nil {
			if r.Context().Err() != nil {
				return
			}
			continue
		}
		if (res.StatusCode == 403 || res.StatusCode >= 500) && i < len(candidates)-1 {
			res.Body.Close()
			continue
		}
		for _, h := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"} {
			if v := res.Header.Get(h); v != "" {
				w.Header().Set(h, v)
			}
		}
		w.WriteHeader(res.StatusCode)
		io.Copy(w, res.Body)
		res.Body.Close()
		return
	}
	http.Error(w, "CDN unavailable", http.StatusBadGateway)
}
