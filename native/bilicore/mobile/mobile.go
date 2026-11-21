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
	"sort"
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
	liveTargets  map[string]struct{}
}

var agent = &session{targets: map[string][]string{}, liveTargets: map[string]struct{}{}}

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
		mux.HandleFunc(prefix+"/authorize-live", agent.authorizeLive)
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
	agent.liveTargets = map[string]struct{}{}
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
	agent.liveTargets = map[string]struct{}{}
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
	agent.liveTargets = map[string]struct{}{}
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
	errorCode := "RESOLVE_FAILED"
	if e, ok := err.(*core.ResolveError); ok {
		errorCode = e.Code
	}
	io.WriteString(w, asJSON(map[string]any{"success": false, "code": errorCode, "message": err.Error()}))
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
	page, _ := strconv.Atoi(q.Get("page"))
	if cid < 0 || page < 0 || qn < 0 || fallback < 0 {
		apiError(w, fmt.Errorf("解析参数范围无效"))
		return
	}
	result, err := core.ResolveMobile(ctx, core.ResolveOptions{Url: resolveInput(q), Cid: cid, Qn: qn, Page: page, Cookie: cookie, QualityMode: mode, Capabilities: caps, FallbackQn: fallback, PreferMp4: q.Get("preferMp4") == "true" && q.Get("forceDash") != "true", ForceDash: q.Get("forceDash") == "true"})
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

// RegisterHostMedia accepts a pair returned by the authenticated room resolver.
// Keep both signed strings intact so the player can request their exact URLs.
func RegisterHostMedia(videoURL, audioURL string, version int) error {
	agent.mu.Lock()
	defer agent.mu.Unlock()
	if agent.server == nil || version != agent.epoch {
		return fmt.Errorf("代理会话已变化，请重新解析")
	}
	if !allowedCDN(videoURL) || (audioURL != "" && !allowedCDN(audioURL)) {
		return fmt.Errorf("房主解析返回的媒体地址不受支持")
	}
	for _, target := range []string{videoURL, audioURL} {
		if _, issued := agent.targets[target]; target != "" && !issued {
			agent.targets[target] = nil
		}
	}
	return nil
}

func allowedCDN(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.User != nil || u.Fragment != "" || (u.Scheme != "https" && u.Scheme != "http") {
		return false
	}
	h := strings.ToLower(u.Hostname())
	edge := strings.HasSuffix(h, ".mountaintoys.cn")
	trusted := strings.HasSuffix(h, ".bilivideo.com") || strings.HasSuffix(h, ".bilivideo.cn") || strings.HasSuffix(h, ".bilivideo.net") || edge || h == "upos-hz-mirrorakam.akamaized.net"
	// B 站返回的 HTTPS edge 链接还使用 4483；不放宽其他域名或端口。
	portAllowed := u.Port() == "" || u.Port() == "443" || u.Port() == "80" || (edge && u.Scheme == "https" && u.Port() == "4483")
	return trusted && portAllowed
}

func allowedLiveCDN(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.User != nil || u.Scheme != "https" || u.Fragment != "" || u.Opaque != "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	return (port == "" || port == "443") &&
		(strings.HasSuffix(host, ".bilivideo.com") || strings.HasSuffix(host, ".bilivideo.cn") || strings.HasSuffix(host, ".bilivideo.net"))
}

func mediaCandidates(target string, backups []string) []string {
	seen := make(map[string]bool)
	result := make([]string, 0, len(backups)+1)
	for _, candidate := range append([]string{target}, backups...) {
		if seen[candidate] || !allowedCDN(candidate) {
			continue
		}
		seen[candidate] = true
		result = append(result, candidate)
	}
	// mcdn/edge 节点经常无法连接或首包很慢；优先使用解析响应中同轨的普通 CDN。
	priority := func(raw string) int {
		u, _ := url.Parse(raw)
		host := strings.ToLower(u.Hostname())
		if strings.HasSuffix(host, ".mcdn.bilivideo.cn") {
			return 2
		}
		if strings.HasSuffix(host, ".mountaintoys.cn") {
			return 1
		}
		return 0
	}
	sort.SliceStable(result, func(i, j int) bool { return priority(result[i]) < priority(result[j]) })
	return result
}

var streamClient = &http.Client{
	Transport: &http.Transport{Proxy: nil, ResponseHeaderTimeout: 10 * time.Second, IdleConnTimeout: 30 * time.Second, MaxIdleConns: 16, MaxIdleConnsPerHost: 8},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 5 || !allowedCDN(req.URL.String()) {
			return fmt.Errorf("CDN redirect denied")
		}
		setMediaRequestHeaders(req, "https://www.bilibili.com")
		if len(via) > 0 {
			if value := via[len(via)-1].Header.Get("Range"); value != "" {
				req.Header.Set("Range", value)
			}
		}
		return nil
	},
}

var liveStreamClient = &http.Client{
	Transport: &http.Transport{Proxy: nil, ResponseHeaderTimeout: 20 * time.Second, IdleConnTimeout: 90 * time.Second, MaxIdleConns: 16, MaxIdleConnsPerHost: 8},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 || !allowedLiveCDN(req.URL.String()) {
			return fmt.Errorf("live CDN redirect denied")
		}
		setMediaRequestHeaders(req, "https://live.bilibili.com")
		if len(via) > 0 {
			if value := via[len(via)-1].Header.Get("Range"); value != "" {
				req.Header.Set("Range", value)
			}
		}
		return nil
	},
}

func setMediaRequestHeaders(req *http.Request, referer string) {
	req.Header.Set("User-Agent", "Mozilla/5.0")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Referer", referer)
	req.Header.Set("Origin", referer)
}

func (a *session) authorizeLive(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	target := r.URL.Query().Get("url")
	if !allowedLiveCDN(target) {
		http.Error(w, "live media URL denied", http.StatusBadRequest)
		return
	}
	a.mu.Lock()
	if a.liveTargets == nil {
		a.liveTargets = map[string]struct{}{}
	}
	a.liveTargets[target] = struct{}{}
	base := a.base
	a.mu.Unlock()
	if base == "" {
		http.Error(w, "proxy unavailable", http.StatusServiceUnavailable)
		return
	}
	query := url.Values{}
	query.Set("url", target)
	query.Set("ref", "live")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":  true,
		"proxyUrl": base + "/proxy?" + query.Encode(),
	})
}

func (a *session) proxy(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("url")
	ref := r.URL.Query().Get("ref")
	if ref != "" && ref != "live" {
		http.Error(w, "invalid media reference", http.StatusBadRequest)
		return
	}
	live := ref == "live"
	a.mu.RLock()
	backups, issued := a.targets[target]
	if live {
		_, issued = a.liveTargets[target]
		backups = nil
	}
	a.mu.RUnlock()
	if !issued || (live && !allowedLiveCDN(target)) || (!live && !allowedCDN(target)) {
		http.Error(w, "unissued media URL", http.StatusForbidden)
		return
	}
	candidates := mediaCandidates(target, backups)
	client := streamClient
	referer := "https://www.bilibili.com"
	if live {
		candidates = []string{target}
		client = liveStreamClient
		referer = "https://live.bilibili.com"
	}
	for i, u := range candidates {
		if (live && !allowedLiveCDN(u)) || (!live && !allowedCDN(u)) {
			continue
		}
		req, err := http.NewRequestWithContext(r.Context(), r.Method, u, nil)
		if err != nil {
			continue
		}
		setMediaRequestHeaders(req, referer)
		if value := r.Header.Get("Range"); value != "" {
			req.Header.Set("Range", value)
		}
		res, err := client.Do(req)
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
		if live {
			contentType := strings.ToLower(res.Header.Get("Content-Type"))
			if contentType == "" || strings.Contains(contentType, "application/json") {
				w.Header().Set("Content-Type", "video/x-flv")
			}
		}
		w.WriteHeader(res.StatusCode)
		if live {
			copyStreaming(w, res.Body)
		} else {
			_, _ = io.Copy(w, res.Body)
		}
		res.Body.Close()
		return
	}
	http.Error(w, "CDN unavailable", http.StatusBadGateway)
}

func copyStreaming(w http.ResponseWriter, body io.Reader) {
	buffer := make([]byte, 64<<10)
	controller := http.NewResponseController(w)
	for {
		n, readErr := body.Read(buffer)
		if n > 0 {
			if _, err := w.Write(buffer[:n]); err != nil {
				return
			}
			_ = controller.Flush()
		}
		if readErr != nil {
			return
		}
	}
}

func resolveInput(q url.Values) string {
	if q.Get("epId") != "" {
		return "ep" + q.Get("epId")
	}
	if q.Get("seasonId") != "" {
		return "ss" + q.Get("seasonId")
	}
	return q.Get("bvid")
}
