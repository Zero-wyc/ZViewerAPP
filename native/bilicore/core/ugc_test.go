package core

import (
	"context"
	"encoding/json"
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
	bilibiliHTTPClient = &http.Client{Transport: fixtureTransport(func(r *http.Request) (*http.Response, error) {
		body := ""
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
			if q.Get("cid") != "1002" || q.Get("qn") != "64" || q.Get("fnval") != "2128" || q.Get("w_rid") == "" {
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
}
