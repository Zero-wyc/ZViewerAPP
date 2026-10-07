package core

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// Expand only known Bilibili short-link hosts, without account credentials.
func expandMobileInput(ctx context.Context, input string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(input))
	if err != nil || u.Host == "" {
		return input, nil
	}
	short := u.Hostname() == "b23.tv" || u.Hostname() == "bili2233.cn"
	if !short {
		return input, nil
	}
	if u.Scheme != "http" && u.Scheme != "https" || u.User != nil {
		return "", fmt.Errorf("短链接地址无效")
	}
	client := *bilibiliHTTPClient
	client.Jar = nil
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		host := strings.ToLower(req.URL.Hostname())
		if len(via) >= 5 || req.URL.User != nil || (req.URL.Scheme != "http" && req.URL.Scheme != "https") || !(host == "b23.tv" || host == "bili2233.cn" || host == "bilibili.com" || strings.HasSuffix(host, ".bilibili.com")) {
			return fmt.Errorf("短链接重定向目标不受支持")
		}
		req.Header.Del("Cookie")
		req.Header.Del("Authorization")
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", userAgent)
	response, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	io.Copy(io.Discard, io.LimitReader(response.Body, 1024))
	expanded := response.Request.URL.String()
	if kind, _ := pgcIdentity(expanded); kind != "" {
		return expanded, nil
	}
	if bvid, err := extractBvid(expanded); err == nil {
		return "https://www.bilibili.com/video/" + bvid, nil
	}
	return "", fmt.Errorf("短链接未指向可播放的 BV / ep / ss")
}
