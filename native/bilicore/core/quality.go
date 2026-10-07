package core

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Capability describes a WebView-supported codec and its measured limits.
type Capability struct {
	Codec        string  `json:"codec"`
	MaxWidth     int     `json:"maxWidth"`
	MaxHeight    int     `json:"maxHeight"`
	MaxFrameRate float64 `json:"maxFrameRate"`
}

var standardQualityOrder = []int{127, 120, 116, 112, 80, 74, 64, 32, 16}

func numberField(m map[string]any, key string) int {
	if v, ok := m[key].(float64); ok {
		return int(v)
	}
	return 0
}

func qualityRank(qn int) int {
	for i, id := range standardQualityOrder {
		if qn == id {
			return len(standardQualityOrder) - i
		}
	}
	return 0
}

func supportedTrack(t DashMediaTrack, caps []Capability) bool {
	if t.BaseUrl == "" || qualityRank(t.ID) == 0 {
		return false
	}
	width, height := t.Width, t.Height
	if width == 0 || height == 0 {
		if q, ok := qnQualityMap[t.ID]; ok {
			fmt.Sscanf(q.Resolution, "%dx%d", &width, &height)
		}
	}
	fps, _ := strconv.ParseFloat(t.FrameRate, 64)
	if strings.Contains(t.FrameRate, "/") {
		var a, b float64
		fmt.Sscanf(t.FrameRate, "%f/%f", &a, &b)
		if b > 0 {
			fps = a / b
		}
	}
	for _, c := range caps {
		if detectCodec(t.Codecs) == c.Codec && width > 0 && height > 0 && width <= c.MaxWidth && height <= c.MaxHeight && (fps == 0 || fps <= c.MaxFrameRate) {
			return true
		}
	}
	return false
}

// SelectTrack never equates accept_quality with permission to play a track.
func SelectTrack(tracks []DashMediaTrack, caps []Capability, isVip bool, manualQn, fallbackQn int) *DashMediaTrack {
	eligible := make([]DashMediaTrack, 0)
	for _, t := range tracks {
		if (t.ID == 125 || t.ID == 126) || !supportedTrack(t, caps) {
			continue
		}
		if !isVip && intSliceContains(vipOnlyQns, t.ID) {
			continue
		}
		if manualQn > 0 && t.ID != manualQn {
			continue
		}
		if fallbackQn > 0 && t.ID > fallbackQn {
			continue
		}
		eligible = append(eligible, t)
	}
	sort.SliceStable(eligible, func(i, j int) bool {
		a, b := eligible[i], eligible[j]
		if a.ID != b.ID {
			return qualityRank(a.ID) > qualityRank(b.ID)
		}
		if detectCodec(a.Codecs) != detectCodec(b.Codecs) {
			return detectCodec(a.Codecs) == "avc"
		}
		return a.Bandwidth > b.Bandwidth
	})
	if len(eligible) == 0 {
		return nil
	}
	return &eligible[0]
}

func ResolveMobile(ctx context.Context, opts ResolveOptions) (*ResolveResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	kind, _ := pgcIdentity(opts.Url)
	expanded, expandErr := expandMobileInput(ctx, opts.Url)
	if expandErr != nil {
		return nil, expandErr
	}
	opts.Url = expanded
	kind, _ = pgcIdentity(opts.Url)
	var info *BilibiliVideoInfo
	var pgc *pgcContext
	var err error
	bvid := ""
	if kind != "" {
		info, pgc, err = fetchPgcInfo(ctx, opts.Url, opts.Cookie, opts.Cid)
	} else {
		bvid, err = extractBvid(opts.Url)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(opts.Cookie) == "" {
			return nil, &ResolveError{Message: "B站登录已失效，请重新登录", Code: "NOT_LOGGED_IN"}
		}
		info, err = fetchVideoInfoContext(ctx, bvid, opts.Cookie)
	}
	if err != nil {
		return nil, err
	}
	vip := false
	if opts.Cookie != "" {
		vip, err = getVipStatusContext(ctx, opts.Cookie)
		if err != nil {
			return nil, err
		}
	}
	cid := opts.Cid
	if pgc != nil {
		cid = info.Cid
	}
	currentPage := 1
	pages := []ResolvePageInfo{}
	for _, p := range info.Pages {
		pages = append(pages, ResolvePageInfo{Page: p.Page, Cid: p.Cid, Part: p.Part, Duration: p.Duration, EpID: p.EpID, Badge: p.Badge})
		if cid == 0 && (opts.Page == p.Page || opts.Page == 0 && p.Page == 1) {
			cid = p.Cid
		}
		if p.Cid == cid {
			currentPage = p.Page
		}
	}
	if cid == 0 {
		cid = info.Cid
	}
	foundCid := false
	for _, p := range info.Pages {
		if p.Cid == cid {
			foundCid = true
		}
	}
	if !foundCid {
		return nil, &ResolveError{Code: "CID_MISMATCH", Message: "分集不属于该视频"}
	}
	caps := opts.Capabilities
	if caps == nil {
		caps = []Capability{{Codec: "avc", MaxWidth: 1920, MaxHeight: 1080, MaxFrameRate: 30}}
	}

	requestQn := 127
	manual := 0
	if opts.QualityMode == "manual" {
		manual = opts.Qn
		requestQn = manual
	}
	if opts.FallbackQn > 0 {
		requestQn = opts.FallbackQn
	}
	get := func(qn int) (*BilibiliPlayUrlResult, error) {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if pgc != nil {
			return getPgcPlay(ctx, pgc, cid, opts.Cookie, qn, opts.PreferMp4)
		}
		return getPlayUrl(bvid, cid, opts.Cookie, &getPlayUrlOptions{Qn: qn, IsVip: vip, Fnval: 16 | 64 | 2048, Context: ctx})
	}
	discovered, firstErr := get(requestQn)
	if firstErr != nil {
		// Only permission errors can be resolved by requesting lower quality.
		if !isPermissionError(firstErr) {
			return nil, firstErr
		}
		if manual > 0 {
			return nil, firstErr
		}
		discovered, err = get(64)
		if err != nil {
			return nil, err
		}
	}
	if discovered == nil {
		return nil, &NoPermissionError{}
	}
	if pgc != nil && discovered.Format == "mp4" && len(discovered.Durl) > 0 {
		if manual > 0 && discovered.CurrentQn != manual {
			return nil, &ResolveError{Code: "QUALITY_UNAVAILABLE", Message: "源站未返回所选 MP4 画质，请选择实际可用画质或 DASH"}
		}
		if len(discovered.Durl) != 1 {
			return nil, &ResolveError{Code: "MULTIPART_UNSUPPORTED", Message: "当前番剧返回多段 MP4，请改用 DASH"}
		}
		duration := getCurrentPageDuration(info, cid)
		actual := int((discovered.Durl[0].Length + 500) / 1000)
		preview := discovered.Preview || actual > 0 && duration > actual+3
		if preview && actual > 0 {
			duration = actual
		}
		result := applyPgcMeta(&ResolveResult{Title: info.Title, Duration: duration, Cid: cid, VideoUrl: discovered.Durl[0].Url, Format: "mp4", LoggedIn: opts.Cookie != "", VipStatus: boolToInt(vip), CurrentQn: discovered.CurrentQn, AcceptQuality: discovered.AcceptQuality, Pages: pages, CurrentPage: currentPage}, pgc, discovered)
		result.Preview = preview
		return result, nil
	}
	if len(caps) == 0 {
		return nil, &ResolveError{Message: "当前 WebView 不支持 DASH 视频解码", Code: "NO_SUPPORTED_TRACK"}
	}
	allTracks := append([]DashMediaTrack{}, discovered.AllVideo...)
	selected := SelectTrack(allTracks, caps, vip, manual, opts.FallbackQn)
	fallbackLimit := 64
	if opts.FallbackQn > 0 && opts.FallbackQn < fallbackLimit {
		fallbackLimit = opts.FallbackQn
	}
	// Some responses only include tracks for the requested quality. Discover
	// missing advertised standard tiers, highest first, before settling lower.
	if manual == 0 && opts.FallbackQn == 0 {
		for _, qn := range standardQualityOrder {
			if qn == 74 {
				continue
			} // No >=1080 candidate: product fallback is 720p.
			if selected != nil && qualityRank(selected.ID) >= qualityRank(qn) {
				break
			}
			if !qualityListContains(discovered.AcceptQuality, qn) {
				continue
			}
			if !vip && intSliceContains(vipOnlyQns, qn) {
				continue
			}
			present := false
			for _, t := range allTracks {
				if t.ID == qn {
					present = true
				}
			}
			if present {
				continue
			}
			next, e := get(qn)
			if e != nil {
				if isPermissionError(e) {
					continue
				}
				return nil, e
			}
			allTracks = append(allTracks, next.AllVideo...)
			if len(next.Audio) > 0 {
				discovered.Audio = next.Audio
			}
			selected = SelectTrack(allTracks, caps, vip, 0, 0)
		}
	}
	// 720p60 is not the fallback target when high quality is unavailable.
	if manual == 0 && selected != nil && qualityRank(selected.ID) < qualityRank(80) {
		selected = SelectTrack(allTracks, caps, vip, 0, fallbackLimit)
	}
	if selected == nil && manual == 0 {
		for _, qn := range []int{64, 32, 16} {
			if qn > fallbackLimit {
				continue
			}
			next, e := get(qn)
			if e != nil {
				if isPermissionError(e) {
					continue
				}
				return nil, e
			}
			allTracks = append(allTracks, next.AllVideo...)
			if len(next.Audio) > 0 {
				discovered.Audio = next.Audio
			}
			selected = SelectTrack(allTracks, caps, vip, 0, fallbackLimit)
			if selected != nil {
				break
			}
		}
	}
	if selected == nil {
		return nil, &ResolveError{Message: "没有账号和设备可播放的普通画质轨道", Code: "NO_SUPPORTED_TRACK"}
	}
	var audio *DashMediaTrack
	for _, t := range discovered.Audio {
		if strings.HasPrefix(t.Codecs, "mp4a.40.") && t.BaseUrl != "" {
			if audio == nil || t.Bandwidth > audio.Bandwidth {
				copy := t
				audio = &copy
			}
		}
	}
	if audio == nil {
		return nil, &ResolveError{Message: "未获取到可播放的 AAC 音轨", Code: "NO_SUPPORTED_AUDIO"}
	}
	available := []QualityItem{}
	seen := map[int]bool{}
	for _, t := range allTracks {
		if !seen[t.ID] && supportedTrack(t, caps) && (vip || !intSliceContains(vipOnlyQns, t.ID)) {
			seen[t.ID] = true
			q := qnQualityMap[t.ID]
			available = append(available, QualityItem{ID: t.ID, Label: q.Label, Resolution: q.Resolution})
		}
	}
	sort.Slice(available, func(i, j int) bool { return qualityRank(available[i].ID) > qualityRank(available[j].ID) })
	videoBackups, audioBackups := collectBackupUrls(selected, audio)
	return applyPgcMeta(&ResolveResult{Title: info.Title, ResolvedURL: "https://www.bilibili.com/video/" + bvid, Duration: getCurrentPageDuration(info, cid), Cid: cid, VideoUrl: selected.BaseUrl, AudioUrl: audio.BaseUrl, VideoCodec: selected.Codecs, AudioCodec: audio.Codecs, Format: "dash", LoggedIn: opts.Cookie != "", VipStatus: boolToInt(vip), CurrentQn: selected.ID, AcceptQuality: available, Pages: pages, CurrentPage: currentPage, VideoBackupUrls: videoBackups, AudioBackupUrls: audioBackups}, pgc, discovered), nil
}
