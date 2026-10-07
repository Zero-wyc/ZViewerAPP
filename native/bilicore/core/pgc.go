package core

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

type pgcEpisode struct {
	ID        int64  `json:"id"`
	EpID      int64  `json:"ep_id"`
	Cid       int64  `json:"cid"`
	Bvid      string `json:"bvid"`
	Title     string `json:"title"`
	LongTitle string `json:"long_title"`
	Badge     string `json:"badge"`
	Duration  int    `json:"duration"`
}
type pgcSeason struct {
	ID          int64        `json:"season_id"`
	Title       string       `json:"title"`
	Episodes    []pgcEpisode `json:"episodes"`
	MainSection struct {
		Episodes []pgcEpisode `json:"episodes"`
	} `json:"main_section"`
	Sections []struct {
		Episodes []pgcEpisode `json:"episodes"`
	} `json:"section"`
}
type pgcContext struct {
	EpID, SeasonID int64
	Title, URL     string
}

var pgcPath = regexp.MustCompile(`(?i)(?:^|/bangumi/play/)(ep|ss)([1-9][0-9]*)(?:$|[/?#])`)

func pgcIdentity(input string) (kind string, id int64) {
	m := pgcPath.FindStringSubmatch(strings.TrimSpace(input))
	if len(m) == 3 {
		var err error
		id, err = strconv.ParseInt(m[2], 10, 64)
		if err != nil || id > 9007199254740991 {
			return "", 0
		}
		return strings.ToLower(m[1]), id
	}
	return "", 0
}

func mapPgcError(err error) error {
	if err == nil {
		return nil
	}
	message := err.Error()
	code, text := "INFO_FAILED", "番剧解析失败"
	switch {
	case strings.Contains(message, "[-10403]"):
		code, text = "REGION_LIMITED", "该内容存在地区观看限制"
	case strings.Contains(message, "[-404]"):
		code, text = "EP_NOT_FOUND", "该番剧或集数不存在/已下架"
	case strings.Contains(message, "[-403]") || strings.Contains(message, "[-514]"):
		code, text = "NO_PERMISSION", "该内容需购买或有效大会员资格"
	case strings.Contains(message, "[-101]"):
		code, text = "NOT_LOGGED_IN", "B 站凭据已过期，请重新登录"
	default:
		return err
	}
	return &ResolveError{Code: code, Message: text}
}

func fetchPgcInfo(ctx context.Context, input, cookie string, requestedCid int64) (*BilibiliVideoInfo, *pgcContext, error) {
	kind, id := pgcIdentity(input)
	if id <= 0 {
		return nil, nil, &ResolveError{Code: "INVALID_URL", Message: "番剧 ID 无效"}
	}
	key := "ep_id"
	if kind == "ss" {
		key = "season_id"
	}
	var season pgcSeason
	if err := bilibiliFetchContext(ctx, "https://api.bilibili.com/pgc/view/web/season?"+key+"="+strconv.FormatInt(id, 10), cookie, &season); err != nil {
		return nil, nil, mapPgcError(err)
	}
	eps := season.Episodes
	if len(eps) == 0 {
		eps = season.MainSection.Episodes
	}
	if len(eps) == 0 {
		for _, section := range season.Sections {
			eps = append(eps, section.Episodes...)
		}
	}
	info := &BilibiliVideoInfo{Title: season.Title}
	var target *pgcEpisode
	for _, raw := range eps {
		ep := raw
		if ep.EpID == 0 {
			ep.EpID = ep.ID
		}
		if ep.EpID <= 0 || ep.Cid <= 0 {
			continue
		}
		part := ep.Title
		if ep.LongTitle != "" {
			part += " " + ep.LongTitle
		}
		info.Pages = append(info.Pages, BilibiliVideoPage{Cid: ep.Cid, Page: len(info.Pages) + 1, Part: part, Duration: (ep.Duration + 500) / 1000, EpID: ep.EpID, Badge: ep.Badge})
		if (kind == "ep" && ep.EpID == id) || (kind == "ss" && target == nil && requestedCid == 0) || (kind == "ss" && ep.Cid == requestedCid) {
			copy := ep
			target = &copy
		}
	}
	if target == nil {
		return nil, nil, &ResolveError{Code: "EP_NOT_FOUND", Message: "该番剧暂无目标分集"}
	}
	if requestedCid > 0 && requestedCid != target.Cid {
		return nil, nil, &ResolveError{Code: "CID_MISMATCH", Message: "番剧集号与 cid 不一致"}
	}
	info.Cid = target.Cid
	info.Bvid = target.Bvid
	info.Duration = (target.Duration + 500) / 1000
	return info, &pgcContext{EpID: target.EpID, SeasonID: season.ID, Title: season.Title, URL: fmt.Sprintf("https://www.bilibili.com/bangumi/play/ep%d", target.EpID)}, nil
}

func getPgcPlay(ctx context.Context, pgc *pgcContext, cid int64, cookie string, qn int, mp4 bool) (*BilibiliPlayUrlResult, error) {
	params := url.Values{"ep_id": {strconv.FormatInt(pgc.EpID, 10)}, "cid": {strconv.FormatInt(cid, 10)}, "qn": {strconv.Itoa(qn)}, "fnver": {"0"}, "fnval": {"2128"}, "fourk": {"1"}}
	if mp4 {
		params.Set("fnval", "1")
	}
	var data map[string]any
	if err := bilibiliFetchContext(ctx, "https://api.bilibili.com/pgc/player/web/playurl?"+params.Encode(), cookie, &data); err != nil {
		return nil, mapPgcError(err)
	}
	result, err := normalizePlayUrlData(data, qn, "")
	if result != nil {
		result.Preview = data["is_preview"] == true || data["is_preview"] == float64(1)
		if milliseconds, ok := data["timelength"].(float64); ok {
			result.Duration = int(milliseconds/1000 + 0.5)
		}
		if result.Duration == 0 {
			if dash, ok := data["dash"].(map[string]any); ok {
				if seconds, ok := dash["duration"].(float64); ok {
					result.Duration = int(seconds + 0.5)
				}
			}
		}
	}
	return result, err
}

func applyPgcMeta(result *ResolveResult, pgc *pgcContext, play *BilibiliPlayUrlResult) *ResolveResult {
	if pgc != nil {
		result.EpID = pgc.EpID
		result.SeasonID = pgc.SeasonID
		result.SeasonTitle = pgc.Title
		result.ResolvedURL = pgc.URL
		result.Preview = play.Preview
		if play.Duration > 0 && play.Duration+3 < result.Duration {
			result.Preview = true
			result.Duration = play.Duration
		}
	}
	return result
}
