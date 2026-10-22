package core

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestFnvalRequestVectors(t *testing.T) {
	for _, tc := range []struct {
		vip   bool
		qn    int
		codec string
		want  int
	}{
		{false, 127, "av1", 16}, {true, 120, "", 208}, {true, 125, "hevc", 208},
		{true, 127, "", 1232}, {true, 127, "av1", 3280}, {true, 126, "", 208},
	} {
		if got := computeFnval(tc.vip, tc.qn, tc.codec); got != tc.want {
			t.Errorf("%+v got %d", tc, got)
		}
	}
}

// Exercise ResolveMobile's actual UGC and PGC HTTP call sites, rather than only
// a helper. The origin intentionally stops after capturing the play request.
func TestMobileActualFnvalRequests(t *testing.T) {
	for _, tc := range []struct {
		name, input, codec string
		vip, mp4           bool
		qn, want           int
	}{
		{"ugc standard", "BV1xx411c7mD", "", false, false, 64, 16},
		{"ugc 4k", "BV1xx411c7mD", "", true, false, 120, 208},
		{"ugc 8k av1", "BV1xx411c7mD", "av1", true, false, 127, 3280},
		{"pgc standard", "ep102", "", false, false, 64, 16},
		{"pgc 8k", "ep102", "", true, false, 127, 1232},
		{"pgc mp4", "ep102", "", true, true, 64, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			old := bilibiliHTTPClient
			ResetSessionCaches()
			t.Cleanup(func() { bilibiliHTTPClient = old; ResetSessionCaches() })
			captured := 0
			bilibiliHTTPClient = &http.Client{Transport: fixtureTransport(func(r *http.Request) (*http.Response, error) {
				body := ""
				switch r.URL.Path {
				case "/x/web-interface/nav":
					vip := 0
					if tc.vip {
						vip = 1
					}
					body = fmt.Sprintf(`{"code":0,"data":{"isLogin":true,"vipStatus":%d,"wbi_img":{"img_url":"https://i.test/7cd084941338484aae1ad9425b84077c.png","sub_url":"https://i.test/4932caff0ff746eab6f01bf08b70ac45.png"}}}`, vip)
				case "/x/web-interface/wbi/view", "/x/web-interface/view":
					body = `{"code":0,"data":{"bvid":"BV1xx411c7mD","cid":1002,"title":"fixture","pages":[{"cid":1002,"page":1,"part":"One","duration":300}]}}`
				case "/pgc/view/web/season":
					body = `{"code":0,"result":{"season_id":900,"title":"fixture","episodes":[{"id":102,"cid":1002,"title":"One","duration":300000}]}}`
				case "/x/player/wbi/playurl", "/x/player/playurl", "/pgc/player/web/playurl":
					captured++
					if got := r.URL.Query().Get("fnval"); got != fmt.Sprint(tc.want) {
						t.Errorf("actual %s fnval=%s want %d", r.URL.Path, got, tc.want)
					}
					body = `{"code":-999,"message":"fixture stop"}`
				default:
					t.Fatalf("unexpected API %s", r.URL.Path)
				}
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
			})}
			_, _ = ResolveMobile(context.Background(), ResolveOptions{Url: tc.input, Cookie: "local-fixture", Qn: tc.qn, Codec: tc.codec, QualityMode: "manual", PreferMp4: tc.mp4})
			if captured == 0 {
				t.Fatal("did not exercise actual play request")
			}
		})
	}
}
