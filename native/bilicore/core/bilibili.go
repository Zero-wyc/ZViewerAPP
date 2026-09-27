package core

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/skip2/go-qrcode"
)

// QRSession 保存一次二维码登录会话。
type QRSession struct {
	QrcodeKey string `json:"qrcodeKey"`
	QrURL     string `json:"qrUrl"`
	QrDataURL string `json:"qrDataUrl"`
	CreatedAt int64  `json:"createdAt"`
}

// QRPollResult 是轮询结果。
type QRPollResult struct {
	Status   int    `json:"status"`
	Message  string `json:"message"`
	Cookie   string `json:"cookie,omitempty"`
	LoggedIn bool   `json:"loggedIn"`
	Name     string `json:"name,omitempty"`
}

// UserValidation Cookie 校验结果。
type UserValidation struct {
	Valid     bool   `json:"valid"`
	Name      string `json:"name,omitempty"`
	Mid       int64  `json:"mid,omitempty"`
	VipStatus int    `json:"vipStatus,omitempty"`
}

func bilibiliHeaders(cookie string) map[string]string {
	h := map[string]string{
		"User-Agent": userAgent,
		"Referer":    "https://www.bilibili.com",
	}
	if cookie != "" {
		h["Cookie"] = cookie
	}
	return h
}

func bilibiliGet(api string, cookie string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodGet, api, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range bilibiliHeaders(cookie) {
		req.Header.Set(k, v)
	}
	return bilibiliHTTPClient.Do(req)
}

func bilibiliJSON(api string, cookie string, out any) error {
	res, err := bilibiliGet(api, cookie)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

func generateQRCode() (*QRSession, error) {
	api := "https://passport.bilibili.com/x/passport-login/web/qrcode/generate"
	var payload struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    *struct {
			URL       string `json:"url"`
			QrcodeKey string `json:"qrcode_key"`
		} `json:"data"`
	}
	if err := bilibiliJSON(api, "", &payload); err != nil {
		return nil, err
	}
	if payload.Code != 0 || payload.Data == nil || payload.Data.QrcodeKey == "" {
		return nil, fmt.Errorf("生成二维码失败: %s", payload.Message)
	}
	png, err := qrcode.Encode(payload.Data.URL, qrcode.Medium, 256)
	if err != nil {
		return nil, err
	}
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
	return &QRSession{
		QrcodeKey: payload.Data.QrcodeKey,
		QrURL:     payload.Data.URL,
		QrDataURL: dataURL,
		CreatedAt: time.Now().UnixMilli(),
	}, nil
}

func pollQRStatus(key string) (*QRPollResult, error) {
	api := "https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=" + url.QueryEscape(key)
	res, err := bilibiliGet(api, "")
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	var payload struct {
		Data *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
			Status  int    `json:"status"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	data := payload.Data
	if data == nil {
		return nil, fmt.Errorf("轮询返回异常")
	}

	status := data.Status
	if data.Code == 0 && data.URL != "" {
		status = 2
	} else if data.Code == 86101 {
		status = 0
	} else if data.Code == 86090 {
		status = 1
	} else if data.Code == 86038 {
		status = 3
	}

	result := &QRPollResult{Status: status, Message: data.Message}
	if status == 2 {
		cookie, err := fetchCookiesFromSsoURL(data.URL)
		if err != nil || cookie == "" {
			cookie = parseSetCookieHeader(res.Header)
		}
		if cookie != "" {
			result.Cookie = cookie
			result.LoggedIn = true
			return result, nil
		}
		result.Message = "登录确认成功，但未能获取 Cookie"
	}
	return result, nil
}

func fetchCookiesFromSsoURL(ssoURL string) (string, error) {
	cookieMap := make(map[string]string)
	current := ssoURL
	seen := make(map[string]bool)
	const maxRedirects = 10

	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	for i := 0; i <= maxRedirects; i++ {
		if seen[current] {
			break
		}
		seen[current] = true

		req, err := http.NewRequest(http.MethodGet, current, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("User-Agent", userAgent)
		req.Header.Set("Referer", "https://www.bilibili.com")
		if len(cookieMap) > 0 {
			req.Header.Set("Cookie", cookieMapToString(cookieMap))
		}

		res, err := client.Do(req)
		if err != nil {
			return "", err
		}
		for _, c := range res.Cookies() {
			if c.Name != "" {
				cookieMap[c.Name] = c.Value
			}
		}
		loc := res.Header.Get("Location")
		res.Body.Close()
		if loc == "" || res.StatusCode < 300 || res.StatusCode >= 400 {
			break
		}
		u, err := url.Parse(loc)
		if err != nil {
			break
		}
		if u.IsAbs() {
			current = loc
		} else {
			base, _ := url.Parse(current)
			current = base.ResolveReference(u).String()
		}
	}

	required := []string{"SESSDATA", "bili_jct", "DedeUserID"}
	missing := []string{}
	for _, r := range required {
		if _, ok := cookieMap[r]; !ok {
			missing = append(missing, r)
		}
	}
	if len(missing) > 0 {
		return "", fmt.Errorf("sso cookie missing: %s", strings.Join(missing, ", "))
	}
	return cookieMapToString(cookieMap), nil
}

func parseSetCookieHeader(h http.Header) string {
	parts := []string{}
	for _, raw := range h.Values("Set-Cookie") {
		for _, c := range strings.Split(raw, ",") {
			c = strings.TrimSpace(c)
			if idx := strings.Index(c, ";"); idx >= 0 {
				c = c[:idx]
			}
			if strings.Contains(c, "=") {
				parts = append(parts, c)
			}
		}
	}
	return strings.Join(parts, "; ")
}

func cookieMapToString(m map[string]string) string {
	parts := make([]string, 0, len(m))
	for k, v := range m {
		parts = append(parts, k+"="+v)
	}
	return strings.Join(parts, "; ")
}

func validateCookie(cookie string) (*UserValidation, error) {
	api := "https://api.bilibili.com/x/web-interface/nav"
	res, err := bilibiliGet(api, cookie)
	if err != nil {
		return &UserValidation{Valid: false}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return &UserValidation{Valid: false}, nil
	}
	var payload struct {
		Data *struct {
			IsLogin   bool   `json:"isLogin"`
			Uname     string `json:"uname"`
			Mid       int64  `json:"mid"`
			VipStatus int    `json:"vipStatus"`
		} `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return &UserValidation{Valid: false}, err
	}
	if payload.Data == nil || !payload.Data.IsLogin {
		return &UserValidation{Valid: false}, nil
	}
	return &UserValidation{
		Valid:     true,
		Name:      payload.Data.Uname,
		Mid:       payload.Data.Mid,
		VipStatus: payload.Data.VipStatus,
	}, nil
}
