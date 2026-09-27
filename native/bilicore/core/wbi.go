package core

import (
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// WBI mixin key 字符抽取表（与 backend/src/services/bilibili/wbi.ts 一致）。
var wbiMixinKeyEncTable = []int{
	46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
	27, 43, 5, 49, 33, 9, 20, 42, 19, 29, 28, 14, 7, 41, 12, 1,
}

// 缓存的 WBI 密钥对。
type wbiKeyPair struct {
	imgKey    string
	subKey    string
	fetchedAt int64 // 秒级时间戳
}

const wbiKeyTTLSeconds = 30 * 60

var (
	wbiKeyCache   = make(map[string]wbiKeyPair)
	wbiKeyCacheMu sync.RWMutex
)

// wbiCookieCacheKey 按 Cookie 隔离 WBI 缓存。
func wbiCookieCacheKey(cookie string) string {
	if cookie == "" {
		return "anonymous"
	}
	h := sha256.Sum256([]byte(cookie))
	return hex.EncodeToString(h[:])[:16]
}

// extractKeyFromWbiUrl 从 WBI 图片 URL 中提取 key。
// URL 形如 https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png
func extractKeyFromWbiUrl(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	path := u.Path
	idx := strings.LastIndex(path, "/")
	if idx < 0 {
		return ""
	}
	filename := path[idx+1:]
	return strings.TrimSuffix(filename, ".png")
}

// getWbiMixinKey 根据 imgKey 与 subKey 生成 mixinKey。
func getWbiMixinKey(imgKey, subKey string) string {
	raw := imgKey + subKey
	var sb strings.Builder
	for _, idx := range wbiMixinKeyEncTable {
		if idx < len(raw) {
			sb.WriteByte(raw[idx])
		}
	}
	return sb.String()[:32]
}

// signParamsWithWbi 对请求参数进行 WBI 签名，返回增加 wts、w_rid 后的参数副本。
func signParamsWithWbi(params map[string]string, imgKey, subKey string) map[string]string {
	mixinKey := getWbiMixinKey(imgKey, subKey)
	signed := make(map[string]string, len(params)+2)
	for k, v := range params {
		signed[k] = v
	}
	signed["wts"] = strconv.FormatInt(time.Now().Unix(), 10)

	// 按键名排序并编码，空值不参与签名
	keys := make([]string, 0, len(signed))
	for k, v := range signed {
		if v != "" {
			keys = append(keys, k)
		}
	}
	// Go 的 map 迭代顺序不稳定，必须排序
	for i := 0; i < len(keys)-1; i++ {
		for j := i + 1; j < len(keys); j++ {
			if keys[i] > keys[j] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}

	var qs strings.Builder
	for i, k := range keys {
		if i > 0 {
			qs.WriteByte('&')
		}
		qs.WriteString(url.QueryEscape(k))
		qs.WriteByte('=')
		qs.WriteString(url.QueryEscape(signed[k]))
	}

	h := md5.Sum([]byte(qs.String() + mixinKey))
	signed["w_rid"] = hex.EncodeToString(h[:])
	return signed
}

// fetchWbiKeys 从 B站 web nav 接口获取 WBI 图片地址，并提取 imgKey、subKey。
func fetchWbiKeys(ctx context.Context, cookie string) (string, string, error) {
	type navData struct {
		WbiImg *struct {
			ImgUrl string `json:"img_url"`
			SubUrl string `json:"sub_url"`
		} `json:"wbi_img"`
	}
	var data navData
	if err := bilibiliFetchContext(ctx, "https://api.bilibili.com/x/web-interface/nav", cookie, &data); err != nil {
		return "", "", err
	}
	if data.WbiImg == nil || data.WbiImg.ImgUrl == "" || data.WbiImg.SubUrl == "" {
		return "", "", fmt.Errorf("从 B站 nav 接口获取 WBI key 失败")
	}
	imgKey := extractKeyFromWbiUrl(data.WbiImg.ImgUrl)
	subKey := extractKeyFromWbiUrl(data.WbiImg.SubUrl)
	if imgKey == "" || subKey == "" {
		return "", "", fmt.Errorf("无法从 WBI 图片 URL 中提取 key")
	}
	return imgKey, subKey, nil
}

// getWbiKeys 获取当前缓存的 WBI key，未缓存或缓存过期时自动拉取。
func getWbiKeys(cookie string) (string, string, error) {
	return getWbiKeysContext(context.Background(), cookie)
}
func getWbiKeysContext(ctx context.Context, cookie string) (string, string, error) {
	key := wbiCookieCacheKey(cookie)
	wbiKeyCacheMu.RLock()
	cached, ok := wbiKeyCache[key]
	wbiKeyCacheMu.RUnlock()
	if ok {
		now := time.Now().Unix()
		if now-cached.fetchedAt < wbiKeyTTLSeconds {
			return cached.imgKey, cached.subKey, nil
		}
	}

	imgKey, subKey, err := fetchWbiKeys(ctx, cookie)
	if err != nil {
		return "", "", err
	}
	wbiKeyCacheMu.Lock()
	wbiKeyCache[key] = wbiKeyPair{imgKey: imgKey, subKey: subKey, fetchedAt: time.Now().Unix()}
	wbiKeyCacheMu.Unlock()
	return imgKey, subKey, nil
}

// clearWbiKeyCache 清空 WBI key 缓存。
func clearWbiKeyCache() {
	wbiKeyCacheMu.Lock()
	wbiKeyCache = make(map[string]wbiKeyPair)
	wbiKeyCacheMu.Unlock()
}
