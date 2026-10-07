package core

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ===================== 常量与类型（与 backend resolver.ts 对齐） =====================

const (
	bilibiliRequestTimeoutMs = 10000
	bilibiliMaxRetries       = 1
	cdnHealthCheckTimeoutMs  = 2000
	mp4MaxQn                 = 80 // MP4 直链最高支持 1080P
	defaultQn                = 80
	vipDefaultQn             = 120
	qn8K                     = 127
)

// VIP 专属清晰度列表
var vipOnlyQns = []int{112, 116, 120, 125, 126, 127}

// 未登录用户允许的最高清晰度
const anonymousMaxQn = 32

// qn 到标签/分辨率的兜底映射表
var qnQualityMap = map[int]struct {
	Label      string
	Resolution string
}{
	127: {Label: "8K 超高清", Resolution: "7680x4320"},
	126: {Label: "杜比视界", Resolution: "3840x2160"},
	125: {Label: "HDR 真彩", Resolution: "3840x2160"},
	120: {Label: "4K 超清", Resolution: "3840x2160"},
	116: {Label: "1080P60", Resolution: "1920x1080"},
	112: {Label: "1080P+", Resolution: "1920x1080"},
	80:  {Label: "1080P", Resolution: "1920x1080"},
	74:  {Label: "720P60", Resolution: "1280x720"},
	64:  {Label: "720P", Resolution: "1280x720"},
	32:  {Label: "480P", Resolution: "854x480"},
	16:  {Label: "360P", Resolution: "640x360"},
}

// BilibiliVideoPage 分集信息。
type BilibiliVideoPage struct {
	EpID     int64  `json:"epId,omitempty"`
	Badge    string `json:"badge,omitempty"`
	Cid      int64  `json:"cid"`
	Page     int    `json:"page"`
	Part     string `json:"part"`
	Duration int    `json:"duration"`
}

// BilibiliVideoInfo 视频信息。
type BilibiliVideoInfo struct {
	Bvid     string              `json:"bvid"`
	Aid      int64               `json:"aid"`
	Cid      int64               `json:"cid"`
	Title    string              `json:"title"`
	Pic      string              `json:"pic,omitempty"`
	Duration int                 `json:"duration"`
	Pages    []BilibiliVideoPage `json:"pages"`
}

// DashMediaTrack DASH 轨道。
type DashMediaTrack struct {
	BaseUrl   string   `json:"baseUrl"`
	BackupUrl []string `json:"backupUrl,omitempty"`
	Bandwidth int      `json:"bandwidth"`
	Codecs    string   `json:"codecs"`
	Width     int      `json:"width"`
	Height    int      `json:"height"`
	FrameRate string   `json:"frameRate"`
	ID        int      `json:"id"`
}

// DurlSegment MP4 直链分片。
type DurlSegment struct {
	Url    string `json:"url"`
	Size   int64  `json:"size"`
	Length int64  `json:"length"`
}

// BilibiliPlayUrlResult 播放地址结果。
type BilibiliPlayUrlResult struct {
	Duration      int
	Preview       bool
	Format        string           `json:"format"`
	AllVideo      []DashMediaTrack `json:"-"`
	Video         []DashMediaTrack `json:"video,omitempty"`
	Audio         []DashMediaTrack `json:"audio,omitempty"`
	Durl          []DurlSegment    `json:"durl,omitempty"`
	BestVideo     *DashMediaTrack  `json:"bestVideo,omitempty"`
	BestAudio     *DashMediaTrack  `json:"bestAudio,omitempty"`
	CurrentQn     int              `json:"currentQn,omitempty"`
	AcceptQuality []QualityItem    `json:"acceptQuality,omitempty"`
}

// QualityItem 清晰度项。
type QualityItem struct {
	ID         int    `json:"id"`
	Label      string `json:"label"`
	Resolution string `json:"resolution,omitempty"`
}

// ResolvePageInfo 返回给前端的分集信息。
type ResolvePageInfo struct {
	EpID     int64  `json:"epId,omitempty"`
	Badge    string `json:"badge,omitempty"`
	Page     int    `json:"page"`
	Cid      int64  `json:"cid"`
	Part     string `json:"part"`
	Duration int    `json:"duration"`
}

// ResolveResult 解析结果。
type ResolveResult struct {
	EpID          int64             `json:"epId,omitempty"`
	SeasonID      int64             `json:"seasonId,omitempty"`
	SeasonTitle   string            `json:"seasonTitle,omitempty"`
	Preview       bool              `json:"preview"`
	ResolvedURL   string            `json:"resolvedUrl,omitempty"`
	Title         string            `json:"title"`
	Duration      int               `json:"duration"`
	Cid           int64             `json:"cid"`
	VideoUrl      string            `json:"videoUrl"`
	AudioUrl      string            `json:"audioUrl,omitempty"`
	VideoCodec    string            `json:"videoCodec,omitempty"`
	AudioCodec    string            `json:"audioCodec,omitempty"`
	Format        string            `json:"format"`
	LoggedIn      bool              `json:"loggedIn"`
	VipStatus     int               `json:"vipStatus"`
	CurrentQn     int               `json:"currentQn,omitempty"`
	AcceptQuality []QualityItem     `json:"acceptQuality,omitempty"`
	Pages         []ResolvePageInfo `json:"pages,omitempty"`
	CurrentPage   int               `json:"currentPage,omitempty"`
	// VideoBackupUrls 存储视频轨道的所有候选 CDN URL（主 URL + backup），供 /proxy 失败重试。
	VideoBackupUrls []string `json:"videoBackupUrls,omitempty"`
	// AudioBackupUrls 存储音频轨道的所有候选 CDN URL（主 URL + backup），供 /proxy 失败重试。
	AudioBackupUrls []string `json:"audioBackupUrls,omitempty"`
}

// ResolveOptions 解析选项。
type ResolveOptions struct {
	Url          string
	Cookie       string
	Qn           int
	Codec        string
	PreferMp4    bool
	Page         int
	Cid          int64
	SkipCdnCheck bool
	// ForceDash 为 true 时强制使用 DASH 格式，禁用 MP4 降级（CLI 代理模式下使用）。
	ForceDash    bool
	QualityMode  string
	Capabilities []Capability
	FallbackQn   int
}

// ResolveError 解析错误。
type ResolveError struct {
	Message string
	Code    string
}

func (e *ResolveError) Error() string { return e.Message }

// NoPermissionError 无权限错误。
type NoPermissionError struct {
	Message string
}

func (e *NoPermissionError) Error() string {
	if e.Message == "" {
		return "无权限播放，可能需要登录或大会员"
	}
	return e.Message
}

// ===================== 缓存 =====================

var (
	videoInfoCache   = make(map[string]bilibiliVideoInfoCacheEntry)
	videoInfoCacheMu sync.RWMutex
	vipStatusCache   = make(map[string]vipStatusCacheEntry)
	vipStatusCacheMu sync.RWMutex
)

type bilibiliVideoInfoCacheEntry struct {
	info     *BilibiliVideoInfo
	cachedAt time.Time
}

type vipStatusCacheEntry struct {
	isVip    bool
	cachedAt time.Time
}

const videoInfoCacheTTL = 2 * time.Minute
const vipStatusCacheTTL = 5 * time.Minute

func normalizeVipCacheKey(cookie string) string {
	re := regexp.MustCompile(`(?:^|;\s*)DedeUserID=(\d+)`)
	m := re.FindStringSubmatch(cookie)
	if len(m) > 1 {
		return "mid:" + m[1]
	}
	return cookie
}

func getCachedVideoInfo(bvid string) *BilibiliVideoInfo {
	videoInfoCacheMu.RLock()
	entry, ok := videoInfoCache[bvid]
	videoInfoCacheMu.RUnlock()
	if !ok || time.Since(entry.cachedAt) > videoInfoCacheTTL {
		return nil
	}
	return entry.info
}

func setCachedVideoInfo(bvid string, info *BilibiliVideoInfo) {
	videoInfoCacheMu.Lock()
	videoInfoCache[bvid] = bilibiliVideoInfoCacheEntry{info: info, cachedAt: time.Now()}
	videoInfoCacheMu.Unlock()
}

func getCachedVipStatus(cookie string) *bool {
	key := normalizeVipCacheKey(cookie)
	vipStatusCacheMu.RLock()
	entry, ok := vipStatusCache[key]
	vipStatusCacheMu.RUnlock()
	if !ok || time.Since(entry.cachedAt) > vipStatusCacheTTL {
		return nil
	}
	v := entry.isVip
	return &v
}

func setCachedVipStatus(cookie string, isVip bool) {
	key := normalizeVipCacheKey(cookie)
	vipStatusCacheMu.Lock()
	vipStatusCache[key] = vipStatusCacheEntry{isVip: isVip, cachedAt: time.Now()}
	vipStatusCacheMu.Unlock()
}

// ===================== bilibiliFetch（与 backend client.ts 对齐） =====================

var anonymousCookieJar string
var anonymousCookieJarMu sync.Mutex

func parseSetCookieHeaderSimple(headers http.Header) string {
	values := headers.Values("Set-Cookie")
	if len(values) == 0 {
		if single := headers.Get("Set-Cookie"); single != "" {
			values = strings.Split(single, ",")
		}
	}
	parts := make([]string, 0, len(values))
	for _, raw := range values {
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

func randomBackoffMs() int {
	return 1000 + rand.Intn(1000)
}

// bilibiliFetch 封装对 B站 API 的请求：自动补充头、412 重试、超时、匿名 Cookie 收集。
// bilibiliHTTPClient 专用于 B站 API 请求的 HTTP 客户端，设置超时避免 context 管理问题。
var bilibiliHTTPClient = &http.Client{
	Timeout: bilibiliRequestTimeoutMs * time.Millisecond,
	Transport: &http.Transport{
		MaxIdleConns:        10,
		MaxIdleConnsPerHost: 5,
		IdleConnTimeout:     60 * time.Second,
	},
}

func bilibiliFetch(api string, cookie string, out any) error {
	return bilibiliFetchContext(context.Background(), api, cookie, out)
}
func bilibiliFetchContext(ctx context.Context, api string, cookie string, out any) error {
	var lastErr error
	for attempt := 0; attempt < bilibiliMaxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, api, nil)
		if err != nil {
			return err
		}

		effectiveCookie := cookie
		if effectiveCookie == "" {
			anonymousCookieJarMu.Lock()
			effectiveCookie = anonymousCookieJar
			anonymousCookieJarMu.Unlock()
		}

		req.Header.Set("User-Agent", userAgent)
		req.Header.Set("Referer", "https://www.bilibili.com")
		req.Header.Set("Origin", "https://www.bilibili.com")
		if effectiveCookie != "" {
			req.Header.Set("Cookie", effectiveCookie)
		}

		res, err := bilibiliHTTPClient.Do(req)
		if err != nil {
			lastErr = err
			if attempt < bilibiliMaxRetries-1 {
				time.Sleep(time.Duration(randomBackoffMs()) * time.Millisecond)
			}
			continue
		}

		// 未登录时收集匿名 Cookie
		if cookie == "" {
			setCookie := parseSetCookieHeaderSimple(res.Header)
			if setCookie != "" {
				anonymousCookieJarMu.Lock()
				if anonymousCookieJar == "" {
					anonymousCookieJar = setCookie
				} else {
					anonymousCookieJar = anonymousCookieJar + "; " + setCookie
				}
				anonymousCookieJarMu.Unlock()
			}
		}

		if res.StatusCode == 412 {
			res.Body.Close()
			lastErr = fmt.Errorf("B站 API 返回 412 风控拦截: %s", api)
			if attempt < bilibiliMaxRetries-1 {
				time.Sleep(time.Duration(randomBackoffMs()) * time.Millisecond)
			}
			continue
		}

		if res.StatusCode != http.StatusOK {
			res.Body.Close()
			lastErr = fmt.Errorf("B站 API 请求失败 [%d]: %s", res.StatusCode, api)
			if attempt < bilibiliMaxRetries-1 {
				time.Sleep(time.Duration(randomBackoffMs()) * time.Millisecond)
			}
			continue
		}

		var payload struct {
			Code    int             `json:"code"`
			Message string          `json:"message"`
			Data    json.RawMessage `json:"data"`
			Result  json.RawMessage `json:"result"`
		}
		if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
			res.Body.Close()
			lastErr = err
			if attempt < bilibiliMaxRetries-1 {
				time.Sleep(time.Duration(randomBackoffMs()) * time.Millisecond)
			}
			continue
		}
		res.Body.Close()

		if payload.Code != 0 {
			lastErr = fmt.Errorf("B站 API 业务错误 [%d] %s: %s", payload.Code, payload.Message, api)
			// 业务错误不重试
			return lastErr
		}

		if out != nil {
			raw := payload.Result
			if len(raw) == 0 || string(raw) == "null" {
				raw = payload.Data
				var nested struct {
					Result json.RawMessage `json:"result"`
				}
				if json.Unmarshal(raw, &nested) == nil && len(nested.Result) > 0 {
					raw = nested.Result
				}
			}
			if err := json.Unmarshal(raw, out); err != nil {
				return err
			}
		}
		return nil
	}
	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("B站 API 请求失败: %s", api)
}

// ===================== VIP / 权限 =====================

// getVipStatus 查询用户大会员状态（带缓存）。
func getVipStatus(cookie string) (bool, error) {
	return getVipStatusContext(context.Background(), cookie)
}
func getVipStatusContext(ctx context.Context, cookie string) (bool, error) {
	if strings.TrimSpace(cookie) == "" {
		return false, nil
	}
	if cached := getCachedVipStatus(cookie); cached != nil {
		return *cached, nil
	}

	type navData struct {
		IsLogin   bool `json:"isLogin"`
		VipStatus int  `json:"vipStatus"`
		VipType   int  `json:"vipType"`
	}
	var data navData
	if err := bilibiliFetchContext(ctx, "https://api.bilibili.com/x/web-interface/nav", cookie, &data); err != nil {
		return false, err
	}
	if !data.IsLogin {
		return false, &ResolveError{Message: "B站登录已失效，请重新登录", Code: "NOT_LOGGED_IN"}
	}
	isVip := data.IsLogin && (data.VipStatus == 1 || data.VipType > 0)
	setCachedVipStatus(cookie, isVip)
	return isVip, nil
}

// filterQualitiesByVip 根据会员状态和登录态过滤可用清晰度列表。
func filterQualitiesByVip(list []QualityItem, isVip bool, hasCookie bool) []QualityItem {
	if isVip {
		return list
	}
	if !hasCookie {
		filtered := make([]QualityItem, 0, len(list))
		for _, q := range list {
			if q.ID <= anonymousMaxQn {
				filtered = append(filtered, q)
			}
		}
		if len(filtered) == 0 {
			return []QualityItem{
				{ID: 32, Label: "480P", Resolution: "854x480"},
				{ID: 16, Label: "360P", Resolution: "640x360"},
			}
		}
		return filtered
	}
	filtered := make([]QualityItem, 0, len(list))
	for _, q := range list {
		if !intSliceContains(vipOnlyQns, q.ID) {
			filtered = append(filtered, q)
		}
	}
	if len(filtered) == 0 {
		return []QualityItem{{ID: 80, Label: "1080P", Resolution: "1920x1080"}}
	}
	return filtered
}

func intSliceContains(s []int, v int) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

// computeFnval 根据 VIP 状态和请求的 qn 计算 fnval 位标志。
func computeFnval(isVip bool, qn int) int {
	dash := 16
	fourK := 64
	eightK := 2048
	if !isVip {
		return dash
	}
	fnval := dash | fourK
	if qn == qn8K {
		fnval |= eightK
	}
	return fnval
}

// getDefaultQn 根据 VIP 状态和登录态返回默认清晰度。
func getDefaultQn(isVip bool, hasCookie bool) int {
	if !hasCookie {
		return anonymousMaxQn
	}
	if isVip {
		return vipDefaultQn
	}
	return defaultQn
}

// ===================== video.ts =====================

// getVideoInfoWbi 使用 WBI 签名调用 view 接口。
func getVideoInfoWbi(ctx context.Context, bvid, cookie string) (*BilibiliVideoInfo, error) {
	imgKey, subKey, err := getWbiKeysContext(ctx, cookie)
	if err != nil {
		return nil, err
	}
	signed := signParamsWithWbi(map[string]string{"bvid": bvid}, imgKey, subKey)
	qs := url.Values{}
	for k, v := range signed {
		qs.Set(k, v)
	}
	api := "https://api.bilibili.com/x/web-interface/wbi/view?" + qs.Encode()

	var info BilibiliVideoInfo
	if err := bilibiliFetchContext(ctx, api, cookie, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

// getVideoInfoLegacy 使用未签名接口作为降级方案。
func getVideoInfoLegacy(ctx context.Context, bvid, cookie string) (*BilibiliVideoInfo, error) {
	api := "https://api.bilibili.com/x/web-interface/view?bvid=" + url.QueryEscape(bvid)
	var info BilibiliVideoInfo
	if err := bilibiliFetchContext(ctx, api, cookie, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

// getVideoInfo 获取 B站视频信息，优先 WBI，失败降级。
func getVideoInfo(bvid, cookie string) (*BilibiliVideoInfo, error) {
	return getVideoInfoContext(context.Background(), bvid, cookie)
}
func getVideoInfoContext(ctx context.Context, bvid, cookie string) (*BilibiliVideoInfo, error) {
	info, err := getVideoInfoWbi(ctx, bvid, cookie)
	if err != nil {
		logf("[bilibili] WBI view 失败，降级到未签名接口: %v", err)
		clearWbiKeyCache()
		return getVideoInfoLegacy(ctx, bvid, cookie)
	}
	return info, nil
}

// ===================== playurl.ts =====================

// getPlayUrlOptions 选项。
type getPlayUrlOptions struct {
	Context  context.Context
	Qn       int
	Codec    string
	IsVip    bool
	Fnval    int
	Platform string
}

// buildAcceptQuality 构建可用清晰度列表。
func buildAcceptQuality(acceptQuality []int, acceptDescription map[int]string, currentQn int) []QualityItem {
	qns := acceptQuality
	if len(qns) == 0 {
		for qn := range acceptDescription {
			qns = append(qns, qn)
		}
	}
	if len(qns) == 0 {
		qns = []int{currentQn}
	}
	items := make([]QualityItem, 0, len(qns))
	for _, qn := range qns {
		fallback := qnQualityMap[qn]
		label := acceptDescription[qn]
		if label == "" {
			label = fallback.Label
		}
		if label == "" {
			label = strconv.Itoa(qn)
		}
		res := fallback.Resolution
		items = append(items, QualityItem{ID: qn, Label: label, Resolution: res})
	}
	return items
}

func detectCodec(codecs string) string {
	c := strings.TrimSpace(codecs)
	if matched, _ := regexp.MatchString(`^avc\d`, c); matched {
		return "avc"
	}
	if matched, _ := regexp.MatchString(`^hvc\d|^hev\d`, c); matched {
		return "hevc"
	}
	if matched, _ := regexp.MatchString(`^av01`, c); matched {
		return "av1"
	}
	return "unknown"
}

func sortByBandwidthDesc(tracks []DashMediaTrack) []DashMediaTrack {
	result := make([]DashMediaTrack, len(tracks))
	copy(result, tracks)
	for i := 0; i < len(result)-1; i++ {
		for j := i + 1; j < len(result); j++ {
			if result[i].Bandwidth < result[j].Bandwidth {
				result[i], result[j] = result[j], result[i]
			}
		}
	}
	return result
}

func sortDashTracks(tracks []DashMediaTrack, codec string) []DashMediaTrack {
	sorted := sortByBandwidthDesc(tracks)
	if len(sorted) == 0 {
		return sorted
	}
	preferred := codec
	if preferred == "" || preferred == "auto" {
		preferred = "avc"
	}
	matched := make([]DashMediaTrack, 0, len(sorted))
	for _, t := range sorted {
		if detectCodec(t.Codecs) == preferred {
			matched = append(matched, t)
		}
	}
	if len(matched) > 0 {
		return matched
	}
	return sorted
}

// rewriteMcdnPort 部分网络环境无法连接 B站 mcdn P2P CDN 的 8082 端口，去掉该端口。
func rewriteMcdnPort(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if strings.HasSuffix(u.Hostname(), ".mcdn.bilivideo.cn") && u.Port() == "8082" {
		u.Host = u.Hostname()
		return u.String()
	}
	return raw
}

func normalizeDashMedia(raw map[string]any) DashMediaTrack {
	baseUrl := ""
	if v, ok := raw["baseUrl"].(string); ok && v != "" {
		baseUrl = v
	} else if v, ok := raw["base_url"].(string); ok && v != "" {
		baseUrl = v
	}
	var backupUrl []string
	if arr, ok := raw["backupUrl"].([]any); ok {
		for _, item := range arr {
			if s, ok := item.(string); ok {
				backupUrl = append(backupUrl, rewriteMcdnPort(s))
			}
		}
	} else if arr, ok := raw["backup_url"].([]any); ok {
		for _, item := range arr {
			if s, ok := item.(string); ok {
				backupUrl = append(backupUrl, rewriteMcdnPort(s))
			}
		}
	}
	bandwidth := 0
	if v, ok := raw["bandwidth"].(float64); ok {
		bandwidth = int(v)
	}
	codecs := ""
	if v, ok := raw["codecs"].(string); ok {
		codecs = v
	}
	id := 0
	if v, ok := raw["id"].(float64); ok {
		id = int(v)
	}
	return DashMediaTrack{
		Width: numberField(raw, "width"), Height: numberField(raw, "height"), FrameRate: fmt.Sprint(raw["frame_rate"]),
		BaseUrl:   rewriteMcdnPort(baseUrl),
		BackupUrl: backupUrl,
		Bandwidth: bandwidth,
		Codecs:    codecs,
		ID:        id,
	}
}

func normalizePlayUrlData(data map[string]any, requestedQn int, codec string) (*BilibiliPlayUrlResult, error) {
	if data == nil {
		return nil, &NoPermissionError{}
	}

	qn := requestedQn
	if v, ok := data["quality"].(float64); ok {
		qn = int(v)
	} else if qn == 0 {
		qn = defaultQn
	}

	acceptQualityRaw := []int{}
	if arr, ok := data["accept_quality"].([]any); ok {
		for _, item := range arr {
			if v, ok := item.(float64); ok {
				acceptQualityRaw = append(acceptQualityRaw, int(v))
			}
		}
	}

	acceptDescription := make(map[int]string)
	if arr, ok := data["accept_description"].([]any); ok {
		for _, item := range arr {
			if m, ok := item.(map[string]any); ok {
				id := 0
				if v, ok := m["qn"].(float64); ok {
					id = int(v)
				}
				desc := ""
				if v, ok := m["desc"].(string); ok {
					desc = v
				}
				if id != 0 {
					acceptDescription[id] = desc
				}
			}
		}
	}

	acceptQuality := buildAcceptQuality(acceptQualityRaw, acceptDescription, qn)

	if dashRaw, ok := data["dash"].(map[string]any); ok {
		if videoArr, ok := dashRaw["video"].([]any); ok && len(videoArr) > 0 {
			allTracks := make([]DashMediaTrack, 0, len(videoArr))
			for _, item := range videoArr {
				if m, ok := item.(map[string]any); ok {
					allTracks = append(allTracks, normalizeDashMedia(m))
				}
			}
			matchedQnTracks := make([]DashMediaTrack, 0, len(allTracks))
			for _, t := range allTracks {
				if t.ID == qn {
					matchedQnTracks = append(matchedQnTracks, t)
				}
			}
			tracksToSort := allTracks
			if len(matchedQnTracks) > 0 {
				tracksToSort = matchedQnTracks
			}
			video := sortDashTracks(tracksToSort, codec)

			var audio []DashMediaTrack
			if audioArr, ok := dashRaw["audio"].([]any); ok {
				for _, item := range audioArr {
					if m, ok := item.(map[string]any); ok {
						audio = append(audio, normalizeDashMedia(m))
					}
				}
			}
			audio = sortByBandwidthDesc(audio)

			result := &BilibiliPlayUrlResult{
				AllVideo:      allTracks,
				Format:        "dash",
				Video:         video,
				Audio:         audio,
				CurrentQn:     qn,
				AcceptQuality: acceptQuality,
			}
			if len(video) > 0 {
				result.BestVideo = &video[0]
				result.CurrentQn = video[0].ID
			}
			if len(audio) > 0 {
				result.BestAudio = &audio[0]
			}
			return result, nil
		}
	}

	if durlArr, ok := data["durl"].([]any); ok && len(durlArr) > 0 {
		segments := make([]DurlSegment, 0, len(durlArr))
		for _, item := range durlArr {
			if m, ok := item.(map[string]any); ok {
				seg := DurlSegment{}
				if v, ok := m["url"].(string); ok {
					seg.Url = v
				}
				if v, ok := m["size"].(float64); ok {
					seg.Size = int64(v)
				}
				if v, ok := m["length"].(float64); ok {
					seg.Length = int64(v)
				}
				segments = append(segments, seg)
			}
		}
		return &BilibiliPlayUrlResult{
			Format:        "mp4",
			Durl:          segments,
			CurrentQn:     qn,
			AcceptQuality: acceptQuality,
		}, nil
	}

	return nil, &NoPermissionError{}
}

func isPermissionError(err error) bool {
	if _, ok := err.(*NoPermissionError); ok {
		return true
	}
	msg := err.Error()
	if strings.Contains(msg, "-101") || strings.Contains(msg, "账号未登录") {
		return false
	}
	keywords := []string{"大会员", "付费", "无权限", "购买", "权限"}
	for _, k := range keywords {
		if strings.Contains(msg, k) {
			return true
		}
	}
	if strings.Contains(msg, "-10403") {
		return true
	}
	return false
}

// getPlayUrlWbi 使用 WBI 签名调用 playurl。
func getPlayUrlWbi(bvid string, cid int64, cookie string, options *getPlayUrlOptions) (*BilibiliPlayUrlResult, error) {
	isVip := false
	requestedQn := defaultQn
	fnval := 0
	platform := ""
	if options != nil {
		isVip = options.IsVip
		if options.Qn != 0 {
			requestedQn = options.Qn
		}
		if options.Fnval != 0 {
			fnval = options.Fnval
		} else {
			fnval = computeFnval(isVip, requestedQn)
		}
		platform = options.Platform
	}

	ctx := context.Background()
	if options != nil && options.Context != nil {
		ctx = options.Context
	}
	imgKey, subKey, err := getWbiKeysContext(ctx, cookie)
	if err != nil {
		return nil, err
	}
	params := map[string]string{
		"bvid":  bvid,
		"cid":   strconv.FormatInt(cid, 10),
		"qn":    strconv.Itoa(requestedQn),
		"fnver": "0",
		"fnval": strconv.Itoa(fnval),
		"fourk": "1",
	}
	if platform == "html5" {
		params["platform"] = "html5"
		params["high_quality"] = "1"
		params["try_look"] = "1"
	}
	signed := signParamsWithWbi(params, imgKey, subKey)
	qs := url.Values{}
	for k, v := range signed {
		qs.Set(k, v)
	}
	api := "https://api.bilibili.com/x/player/wbi/playurl?" + qs.Encode()

	var raw map[string]any
	if err := bilibiliFetchContext(ctx, api, cookie, &raw); err != nil {
		return nil, err
	}
	return normalizePlayUrlData(raw, requestedQn, options.Codec)
}

// getPlayUrlLegacy 使用未签名接口作为降级方案。
func getPlayUrlLegacy(bvid string, cid int64, cookie string, options *getPlayUrlOptions) (*BilibiliPlayUrlResult, error) {
	isVip := false
	requestedQn := defaultQn
	fnval := 0
	platform := ""
	if options != nil {
		isVip = options.IsVip
		if options.Qn != 0 {
			requestedQn = options.Qn
		}
		if options.Fnval != 0 {
			fnval = options.Fnval
		} else {
			fnval = computeFnval(isVip, requestedQn)
		}
		platform = options.Platform
	}

	qs := url.Values{
		"bvid":  {bvid},
		"cid":   {strconv.FormatInt(cid, 10)},
		"qn":    {strconv.Itoa(requestedQn)},
		"fnver": {"0"},
		"fnval": {strconv.Itoa(fnval)},
		"fourk": {"1"},
	}
	if platform == "html5" {
		qs.Set("platform", "html5")
		qs.Set("high_quality", "1")
		qs.Set("try_look", "1")
	}
	api := "https://api.bilibili.com/x/player/playurl?" + qs.Encode()

	var raw map[string]any
	ctx := context.Background()
	if options != nil && options.Context != nil {
		ctx = options.Context
	}
	if err := bilibiliFetchContext(ctx, api, cookie, &raw); err != nil {
		return nil, err
	}
	return normalizePlayUrlData(raw, requestedQn, options.Codec)
}

// getPlayUrl 获取播放地址，优先 WBI，失败降级。
func getPlayUrl(bvid string, cid int64, cookie string, options *getPlayUrlOptions) (*BilibiliPlayUrlResult, error) {
	result, err := getPlayUrlWbi(bvid, cid, cookie, options)
	if err != nil {
		if isPermissionError(err) {
			return nil, &NoPermissionError{}
		}
		logf("[bilibili] WBI playurl 失败，降级到未签名接口: %v", err)
		clearWbiKeyCache()
		result, err = getPlayUrlLegacy(bvid, cid, cookie, options)
		if err != nil {
			if isPermissionError(err) {
				return nil, &NoPermissionError{}
			}
			return nil, err
		}
	}
	return result, nil
}

// ===================== cdn.ts =====================

// checkUrlReachable 使用 HEAD + Range 探测单个 URL 是否可达。
// cdnCheckClient 专用于 CDN 健康检查的 HTTP 客户端，短超时 + 连接池。
var cdnCheckClient = &http.Client{
	Timeout: cdnHealthCheckTimeoutMs * time.Millisecond,
	Transport: &http.Transport{
		MaxIdleConns:        20,
		MaxIdleConnsPerHost: 5,
		IdleConnTimeout:     30 * time.Second,
	},
}

func checkUrlReachable(target string) bool {
	req, err := http.NewRequest(http.MethodHead, target, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Referer", "https://www.bilibili.com")
	req.Header.Set("Origin", "https://www.bilibili.com")
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Range", "bytes=0-0")
	res, err := cdnCheckClient.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	return res.StatusCode >= 200 && res.StatusCode < 300 || res.StatusCode == 405
}

// findReachableMediaUrl 并行检测所有候选 URL，返回第一个可达的 URL。
func findReachableMediaUrl(baseUrl string, backupUrl []string) (string, error) {
	candidates := []string{baseUrl}
	for _, u := range backupUrl {
		if u != "" {
			candidates = append(candidates, u)
		}
	}
	if len(candidates) == 0 {
		return "", fmt.Errorf("没有可用的媒体 URL")
	}

	type result struct {
		url string
		ok  bool
	}
	ch := make(chan result, len(candidates))
	var wg sync.WaitGroup
	for _, u := range candidates {
		wg.Add(1)
		go func(target string) {
			defer wg.Done()
			ok := checkUrlReachable(target)
			ch <- result{url: target, ok: ok}
		}(u)
	}
	go func() {
		wg.Wait()
		close(ch)
	}()

	done := make(chan string, 1)
	go func() {
		for r := range ch {
			if r.ok {
				done <- r.url
				return
			}
		}
		close(done)
	}()

	select {
	case url, ok := <-done:
		if !ok {
			return "", fmt.Errorf("所有 CDN 均不可达")
		}
		return url, nil
	case <-time.After(cdnHealthCheckTimeoutMs*time.Millisecond + 500*time.Millisecond):
		return "", fmt.Errorf("CDN 健康检查超时")
	}
}

// ===================== resolver.ts =====================

// extractBvid 从任意输入提取 BV 号或 av 号。
func extractBvid(input string) (string, error) {
	reBV := regexp.MustCompile(`BV[0-9A-Za-z]{10}`)
	if m := reBV.FindString(input); m != "" {
		return m, nil
	}
	reAV := regexp.MustCompile(`(?i)av(\d+)`)
	if m := reAV.FindStringSubmatch(input); len(m) > 1 {
		return m[1], nil
	}
	return "", fmt.Errorf("无法解析 B站 BV 号")
}

func fetchVideoInfo(bvid, cookie string) (*BilibiliVideoInfo, error) {
	return fetchVideoInfoContext(context.Background(), bvid, cookie)
}
func fetchVideoInfoContext(ctx context.Context, bvid, cookie string) (*BilibiliVideoInfo, error) {
	cacheKey := bvid + "|" + wbiCookieCacheKey(cookie)
	if cached := getCachedVideoInfo(cacheKey); cached != nil {
		return cached, nil
	}
	info, err := getVideoInfoContext(ctx, bvid, cookie)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "[-404]") {
			return nil, &ResolveError{Message: fmt.Sprintf("视频不存在或已被删除（%s），请检查 BV 号是否正确", bvid), Code: "VIDEO_NOT_FOUND"}
		}
		if strings.Contains(msg, "[-101]") {
			return nil, &ResolveError{Message: "B站账号未登录或登录已过期，请重新扫码登录", Code: "NOT_LOGGED_IN"}
		}
		if strings.Contains(msg, "[-403]") || strings.Contains(msg, "[-514]") {
			return nil, &ResolveError{Message: "无权限访问该视频，可能为会员专享或地区限制", Code: "NO_PERMISSION"}
		}
		return nil, &ResolveError{Message: "获取视频信息失败: " + msg, Code: "INFO_FAILED"}
	}
	if info == nil {
		return nil, &ResolveError{Message: "获取视频信息失败", Code: "INFO_FAILED"}
	}
	setCachedVideoInfo(cacheKey, info)
	return info, nil
}

// getCurrentPageDuration 使用 page-specific duration。
func getCurrentPageDuration(info *BilibiliVideoInfo, cid int64) int {
	if len(info.Pages) > 0 {
		targetCid := cid
		if targetCid == 0 {
			targetCid = info.Cid
		}
		for _, p := range info.Pages {
			if p.Cid == targetCid {
				return p.Duration
			}
		}
		return info.Pages[0].Duration
	}
	return info.Duration
}

// fallbackToMp4 DASH 不可达时降级为 MP4 直链。
func fallbackToMp4(bvid string, cid int64, cookie string, qn int, isVip bool, skipCdnCheck bool) (string, int, error) {
	result, err := getPlayUrl(bvid, cid, cookie, &getPlayUrlOptions{
		Qn:       qn,
		Fnval:    1,
		IsVip:    isVip,
		Platform: "html5",
	})
	if err != nil {
		return "", 0, err
	}
	if result != nil && result.Format == "mp4" && len(result.Durl) > 0 && result.Durl[0].Url != "" {
		if skipCdnCheck {
			return result.Durl[0].Url, result.CurrentQn, nil
		}
		url, err := findReachableMediaUrl(result.Durl[0].Url, nil)
		if err != nil {
			return "", 0, err
		}
		return url, result.CurrentQn, nil
	}
	return "", 0, fmt.Errorf("MP4 直链不可用")
}

func narrowAcceptQualityForMp4(list []QualityItem) []QualityItem {
	filtered := make([]QualityItem, 0, len(list))
	for _, q := range list {
		if q.ID <= mp4MaxQn {
			filtered = append(filtered, q)
		}
	}
	if len(filtered) > 0 {
		return filtered
	}
	return []QualityItem{
		{ID: 32, Label: qnQualityMap[32].Label, Resolution: qnQualityMap[32].Resolution},
		{ID: 16, Label: qnQualityMap[16].Label, Resolution: qnQualityMap[16].Resolution},
	}
}

// ResolveBilibiliVideo 编排完整解析流程（与 backend resolveBilibiliVideo 对齐）。
func ResolveBilibiliVideo(opts ResolveOptions) (*ResolveResult, error) {
	if opts.QualityMode != "" {
		return ResolveMobile(context.Background(), opts)
	}
	bvid, err := extractBvid(opts.Url)
	if err != nil {
		return nil, &ResolveError{Message: err.Error(), Code: "INVALID_INPUT"}
	}

	logf("[bilibili] 开始解析视频: %s, qn=%d, preferMp4=%v, forceDash=%v", bvid, opts.Qn, opts.PreferMp4, opts.ForceDash)

	cookie := strings.TrimSpace(opts.Cookie)
	hasCookie := cookie != ""

	// 并行：VIP 校验与视频信息获取
	var isVip bool
	var info *BilibiliVideoInfo
	var vipErr, infoErr error
	done := make(chan struct{}, 2)
	go func() {
		isVip, vipErr = getVipStatus(cookie)
		done <- struct{}{}
	}()
	go func() {
		info, infoErr = fetchVideoInfo(bvid, cookie)
		done <- struct{}{}
	}()
	for i := 0; i < 2; i++ {
		<-done
	}
	if infoErr != nil {
		return nil, infoErr
	}
	if vipErr != nil {
		// VIP 校验失败不阻断，按非会员处理
		isVip = false
	}

	// 确定当前播放分集：优先使用传入的 cid，其次使用 page 参数，最后使用默认 cid
	effectiveCid := info.Cid
	currentPage := 1
	if opts.Cid != 0 {
		effectiveCid = opts.Cid
		if len(info.Pages) > 0 {
			for _, p := range info.Pages {
				if p.Cid == opts.Cid {
					currentPage = p.Page
					break
				}
			}
		}
	} else if opts.Page > 0 && len(info.Pages) > 0 {
		idx := opts.Page - 1
		if idx >= len(info.Pages) {
			idx = len(info.Pages) - 1
		}
		if info.Pages[idx].Cid != 0 {
			effectiveCid = info.Pages[idx].Cid
			currentPage = info.Pages[idx].Page
		}
	} else if len(info.Pages) > 0 {
		for _, p := range info.Pages {
			if p.Cid == info.Cid {
				currentPage = p.Page
				break
			}
		}
	}

	var pagesInfo []ResolvePageInfo
	if len(info.Pages) > 0 {
		pagesInfo = make([]ResolvePageInfo, 0, len(info.Pages))
		for _, p := range info.Pages {
			pagesInfo = append(pagesInfo, ResolvePageInfo{
				Page:     p.Page,
				Cid:      p.Cid,
				Part:     p.Part,
				Duration: p.Duration,
			})
		}
	}

	defaultQn := getDefaultQn(isVip, hasCookie)
	requestedQn := opts.Qn
	if requestedQn == 0 {
		requestedQn = defaultQn
	}

	// 播放地址
	playUrl, err := getPlayUrl(info.Bvid, effectiveCid, cookie, &getPlayUrlOptions{
		Qn:    requestedQn,
		Codec: opts.Codec,
		IsVip: isVip,
	})
	if err != nil {
		if _, ok := err.(*NoPermissionError); ok {
			// 权限错误：逐级降级重试
			fallbackQn := requestedQn
			if requestedQn > 32 {
				fallbackQn = 64
			} else {
				fallbackQn = 16
			}
			if fallbackQn != requestedQn {
				playUrl, err = getPlayUrl(info.Bvid, effectiveCid, cookie, &getPlayUrlOptions{
					Qn:    fallbackQn,
					Codec: opts.Codec,
					IsVip: isVip,
				})
			}
		}
		if err != nil {
			return nil, &ResolveError{Message: "无法获取播放地址，可能需要登录或大会员", Code: "NO_PERMISSION"}
		}
	}
	if playUrl == nil {
		return nil, &ResolveError{Message: "无法获取播放地址，可能需要登录或大会员", Code: "NO_PERMISSION"}
	}

	// 清晰度匹配
	acceptQuality := filterQualitiesByVip(playUrl.AcceptQuality, isVip, hasCookie)
	effectiveQn := playUrl.CurrentQn
	if effectiveQn != 0 && !qualityListContains(acceptQuality, effectiveQn) {
		effectiveQn = acceptQuality[0].ID
	}

	if effectiveQn != 0 && effectiveQn != playUrl.CurrentQn {
		refetched, err := getPlayUrl(info.Bvid, effectiveCid, cookie, &getPlayUrlOptions{
			Qn:    effectiveQn,
			Codec: opts.Codec,
			IsVip: isVip,
		})
		if err != nil {
			if _, ok := err.(*NoPermissionError); !ok {
				return nil, err
			}
		} else if refetched != nil {
			playUrl = refetched
			acceptQuality = filterQualitiesByVip(playUrl.AcceptQuality, isVip, hasCookie)
		}
	}

	// preferMp4 优先路径
	// ForceDash 为 true 时（CLI 代理模式已连接），完全禁用 MP4 降级，强制走 DASH 代理。
	if opts.PreferMp4 && !opts.ForceDash {
		mp4Url, mp4Qn, err := fallbackToMp4(info.Bvid, effectiveCid, cookie, effectiveQn, isVip, opts.SkipCdnCheck)
		if err == nil && mp4Url != "" {
			logf("[bilibili] 解析完成: %s, format=mp4, qn=%d", bvid, mp4Qn)
			mp4AcceptQuality := narrowAcceptQualityForMp4(acceptQuality)
			return &ResolveResult{
				Title:         info.Title,
				Duration:      getCurrentPageDuration(info, effectiveCid),
				Cid:           effectiveCid,
				VideoUrl:      mp4Url,
				Format:        "mp4",
				LoggedIn:      hasCookie,
				VipStatus:     boolToInt(isVip),
				CurrentQn:     mp4Qn,
				AcceptQuality: mp4AcceptQuality,
				Pages:         pagesInfo,
				CurrentPage:   currentPage,
			}, nil
		}
	}

	// DASH 路径
	if playUrl.Format == "dash" && playUrl.BestVideo != nil {
		// 收集视频/音频各自的主 URL + backup URL，供 /proxy 备用重试。
		videoBackupUrls, audioBackupUrls := collectBackupUrls(playUrl.BestVideo, playUrl.BestAudio)

		// 对候选 CDN 做本地可达性探测。
		// CLI 与用户浏览器在同一台机器，本地探测结果具有参考价值；
		// SkipCdnCheck 为 true 时探测失败不阻断、不降级 MP4，仅回退到 BaseUrl。
		var videoUrl, audioUrl string
		var videoErr, audioErr error
		var wg sync.WaitGroup
		wg.Add(1)
		go func() {
			defer wg.Done()
			videoUrl, videoErr = findReachableMediaUrl(playUrl.BestVideo.BaseUrl, playUrl.BestVideo.BackupUrl)
		}()
		if playUrl.BestAudio != nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				audioUrl, audioErr = findReachableMediaUrl(playUrl.BestAudio.BaseUrl, playUrl.BestAudio.BackupUrl)
			}()
		}
		wg.Wait()

		if videoErr != nil {
			if opts.SkipCdnCheck {
				logf("[bilibili] 视频 CDN 本地探测均不可达，因 SkipCdnCheck 回退到 BaseUrl: %v", videoErr)
				videoUrl = playUrl.BestVideo.BaseUrl
			} else {
				return nil, &ResolveError{Message: "无法找到可达的视频 CDN", Code: "CDN_UNREACHABLE"}
			}
		}
		if playUrl.BestAudio != nil && audioErr != nil {
			if opts.SkipCdnCheck {
				logf("[bilibili] 音频 CDN 本地探测均不可达，因 SkipCdnCheck 回退到 BaseUrl: %v", audioErr)
				audioUrl = playUrl.BestAudio.BaseUrl
			} else {
				// 非 SkipCdnCheck 模式下音频 CDN 不可达不阻断，但记录日志
				logf("[bilibili] 音频 CDN 均不可达，尝试无音频播放: %v", audioErr)
			}
		}

		videoCodec := ""
		if playUrl.BestVideo != nil {
			videoCodec = playUrl.BestVideo.Codecs
		}
		audioCodec := ""
		if playUrl.BestAudio != nil {
			audioCodec = playUrl.BestAudio.Codecs
		}

		logf("[bilibili] 解析完成: %s, format=dash, qn=%d, codec=%s, videoCandidates=%d, audioCandidates=%d",
			bvid, playUrl.CurrentQn, videoCodec, len(videoBackupUrls), len(audioBackupUrls))
		logf("[bilibili] 选中视频 CDN: %s", videoUrl)
		if audioUrl != "" {
			logf("[bilibili] 选中音频 CDN: %s", audioUrl)
		}
		return &ResolveResult{
			Title:           info.Title,
			Duration:        getCurrentPageDuration(info, effectiveCid),
			Cid:             effectiveCid,
			VideoUrl:        videoUrl,
			AudioUrl:        audioUrl,
			VideoCodec:      videoCodec,
			AudioCodec:      audioCodec,
			Format:          "dash",
			LoggedIn:        hasCookie,
			VipStatus:       boolToInt(isVip),
			CurrentQn:       playUrl.CurrentQn,
			AcceptQuality:   acceptQuality,
			Pages:           pagesInfo,
			CurrentPage:     currentPage,
			VideoBackupUrls: videoBackupUrls,
			AudioBackupUrls: audioBackupUrls,
		}, nil
	}

	logf("[bilibili] 解析失败: %s, 无法获取可用播放地址", bvid)
	return nil, &ResolveError{Message: "无法获取可用播放地址", Code: "NO_PLAYABLE_URL"}
}

func qualityListContains(list []QualityItem, qn int) bool {
	for _, q := range list {
		if q.ID == qn {
			return true
		}
	}
	return false
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// collectBackupUrls 返回视频和音频轨道各自的主 URL + backup URL 候选列表（已去重）。
func collectBackupUrls(video, audio *DashMediaTrack) (videoUrls, audioUrls []string) {
	add := func(seen map[string]struct{}, u string, urls *[]string) {
		if u == "" {
			return
		}
		if _, ok := seen[u]; ok {
			return
		}
		seen[u] = struct{}{}
		*urls = append(*urls, u)
	}

	seenVideo := make(map[string]struct{})
	if video != nil {
		add(seenVideo, video.BaseUrl, &videoUrls)
		for _, u := range video.BackupUrl {
			add(seenVideo, u, &videoUrls)
		}
	}

	seenAudio := make(map[string]struct{})
	if audio != nil {
		add(seenAudio, audio.BaseUrl, &audioUrls)
		for _, u := range audio.BackupUrl {
			add(seenAudio, u, &audioUrls)
		}
	}
	return videoUrls, audioUrls
}
