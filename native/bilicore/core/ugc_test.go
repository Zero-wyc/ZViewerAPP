package core

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
)

func TestUGCPageQualityAndSplitAudioContract(t *testing.T) {
	content, err := os.ReadFile("../../../scripts/fixtures/pgc-contract.json")
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]json.RawMessage{}
	if err = json.Unmarshal(content, &fixtures); err != nil {
		t.Fatal(err)
	}
	old := bilibiliHTTPClient
	ResetSessionCaches()
	t.Cleanup(func() { bilibiliHTTPClient = old; ResetSessionCaches() })
	playRequests := 0
	expectedCid := "1002"
	bilibiliHTTPClient = &http.Client{Transport: fixtureTransport(func(r *http.Request) (*http.Response, error) {
		body := ""
		if r.URL.Host == "b23.tv" || r.URL.Host == "www.bilibili.com" {
			if r.Header.Get("Cookie") != "" {
				t.Fatal("short-link expansion sent credentials")
			}
			header := make(http.Header)
			code := 200
			if r.URL.Host == "b23.tv" {
				code = 302
				header.Set("Location", "https://www.bilibili.com/video/BV1xx411c7mD?p=2&share_source=copy")
			}
			return &http.Response{StatusCode: code, Header: header, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
		}
		switch r.URL.Path {
		case "/x/web-interface/nav":
			body = `{"code":0,"data":{"isLogin":true,"vipStatus":0,"wbi_img":{"img_url":"https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png","sub_url":"https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png"}}}`
		case "/x/web-interface/wbi/view":
			if r.URL.Query().Get("w_rid") == "" {
				t.Fatal("unsigned video metadata")
			}
			body = `{"code":0,"data":{"bvid":"BV1xx411c7mD","cid":1001,"title":"Two parts","pages":[{"cid":1001,"page":1,"part":"First","duration":600},{"cid":1002,"page":2,"part":"Second","duration":300}]}}`
		case "/x/player/wbi/playurl":
			playRequests++
			q := r.URL.Query()
			if q.Get("cid") != expectedCid || q.Get("qn") != "64" || q.Get("fnval") != "2128" || q.Get("w_rid") == "" {
				t.Fatalf("incorrect device DASH request: %s", r.URL.RawQuery)
			}
			var playback map[string]any
			if err := json.Unmarshal(fixtures["dash"], &playback); err != nil {
				t.Fatal(err)
			}
			// Actual UGC API includes this string; it is not a nested response envelope.
			playback["result"] = "suee"
			playback["from"] = "local"
			encoded, _ := json.Marshal(playback)
			body = `{"code":0,"data":` + string(encoded) + `}`
		default:
			t.Fatalf("unexpected API %s", r.URL.Path)
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})}
	value, err := ResolveMobile(context.Background(), ResolveOptions{Url: "BV1xx411c7mD", Cookie: "SESSDATA=fixture-not-real", Page: 2, Qn: 64, QualityMode: "manual", ForceDash: true, Capabilities: []Capability{{Codec: "avc", MaxWidth: 1920, MaxHeight: 1080, MaxFrameRate: 60}}})
	if err != nil {
		t.Fatal(err)
	}
	if value.Cid != 1002 || value.CurrentPage != 2 || value.CurrentQn != 64 || value.Duration != 300 || value.AudioCodec != "mp4a.40.2" || value.AudioUrl != "https://fixture.bilivideo.com/audio.m4s" || value.VideoUrl != "https://fixture.bilivideo.com/64.m4s" || playRequests != 1 {
		t.Fatalf("incorrect VLC split-track result: %+v", value)
	}
	if len(value.Pages) != 2 || value.Pages[1].Part != "Second" {
		t.Fatal("lost part metadata")
	}
	for _, item := range []struct {
		input    string
		page     int
		cid      int64
		wantPage int
	}{{"https://b23.tv/part", 0, 0, 2}, {"https://www.bilibili.com/video/BV1xx411c7mD?p=2", 0, 0, 2}, {"https://b23.tv/part", 1, 0, 1}, {"https://b23.tv/part", 0, 1001, 1}} {
		expectedCid = fmt.Sprint(1000 + item.wantPage)
		r, e := ResolveMobile(context.Background(), ResolveOptions{Url: item.input, Page: item.page, Cid: item.cid, Cookie: "SESSDATA=fixture-not-real", Qn: 64, QualityMode: "manual", ForceDash: true})
		if e != nil || r.CurrentPage != item.wantPage {
			t.Fatalf("short-link/page selection: %+v %v", r, e)
		}
		if item.wantPage == 2 && r.ResolvedURL != "https://www.bilibili.com/video/BV1xx411c7mD?p=2" {
			t.Fatal("lost canonical page URL")
		}
	}
}
