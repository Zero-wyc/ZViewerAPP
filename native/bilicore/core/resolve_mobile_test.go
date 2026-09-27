package core

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type fakeTransport func(*http.Request) (*http.Response, error)

func (f fakeTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func fixtureAPI(t *testing.T, vip bool, tracks []DashMediaTrack, onlyRequested bool) {
	t.Helper()
	old := bilibiliHTTPClient.Transport
	videoInfoCache = make(map[string]bilibiliVideoInfoCacheEntry)
	vipStatusCache = make(map[string]vipStatusCacheEntry)
	clearWbiKeyCache()
	bilibiliHTTPClient.Transport = fakeTransport(func(r *http.Request) (*http.Response, error) {
		data := map[string]any{}
		switch {
		case strings.HasSuffix(r.URL.Path, "/nav"):
			status := 0
			if vip {
				status = 1
			}
			data = map[string]any{"isLogin": true, "vipStatus": status, "vipType": status, "wbi_img": map[string]any{"img_url": "https://i.bili.com/0123456789abcdef0123456789abcdef.png", "sub_url": "https://i.bili.com/fedcba9876543210fedcba9876543210.png"}}
		case strings.HasSuffix(r.URL.Path, "/view"):
			data = map[string]any{"bvid": "BV1234567890", "cid": 123, "title": "fixture", "duration": 60, "pages": []any{map[string]any{"cid": 123, "page": 1, "duration": 60}, map[string]any{"cid": 456, "page": 2, "duration": 50}}}
		case strings.HasSuffix(r.URL.Path, "/playurl"):
			var chosen []DashMediaTrack
			accepts := []int{}
			for _, track := range tracks {
				accepts = append(accepts, track.ID)
				if !onlyRequested || r.URL.Query().Get("qn") == stringInt(track.ID) {
					chosen = append(chosen, track)
				}
			}
			// Simulate the upstream lowering an unavailable request.
			if len(chosen) == 0 && len(tracks) > 0 {
				chosen = tracks[len(tracks)-1:]
			}
			data = map[string]any{"quality": 127, "accept_quality": accepts, "dash": map[string]any{"video": chosen, "audio": []DashMediaTrack{{ID: 30280, Codecs: "mp4a.40.2", BaseUrl: "https://test.bilivideo.com/audio", Bandwidth: 128000}}}}
		default:
			t.Fatalf("unexpected API %s", r.URL.Path)
		}
		b, _ := json.Marshal(map[string]any{"code": 0, "data": data})
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(string(b))), Request: r}, nil
	})
	t.Cleanup(func() {
		bilibiliHTTPClient.Transport = old
		videoInfoCache = make(map[string]bilibiliVideoInfoCacheEntry)
		vipStatusCache = make(map[string]vipStatusCacheEntry)
		clearWbiKeyCache()
	})
}
func stringInt(v int) string { b, _ := json.Marshal(v); return string(b) }

func TestResolveMobileScenarios(t *testing.T) {
	scenarios := []struct {
		name     string
		vip      bool
		tracks   []DashMediaTrack
		want     int
		fallback int
		only     bool
	}{
		{"ordinary1080", false, []DashMediaTrack{track(112, "avc1.640028"), track(80, "avc1.640028"), track(64, "avc1.640028")}, 80, 0, false},
		{"vipHighestExcludesHDR", true, []DashMediaTrack{track(125, "avc1.640028"), track(126, "avc1.640028"), track(112, "avc1.640028"), track(64, "avc1.640028")}, 112, 0, false},
		{"only720", false, []DashMediaTrack{track(64, "avc1.640028")}, 64, 0, false},
		{"no720Actual480", false, []DashMediaTrack{track(32, "avc1.640028")}, 32, 0, false},
		{"playbackFallback", true, []DashMediaTrack{track(112, "avc1.640028"), track(64, "avc1.640028")}, 64, 64, false},
		{"lowerPlaybackFallback", true, []DashMediaTrack{track(80, "avc1.640028"), track(64, "avc1.640028"), track(32, "avc1.640028")}, 32, 32, false},
		{"discoverMissingAdvertisedTracks", true, []DashMediaTrack{track(112, "avc1.640028"), track(80, "avc1.640028"), track(64, "avc1.640028")}, 112, 0, true},
	}
	for _, s := range scenarios {
		t.Run(s.name, func(t *testing.T) {
			fixtureAPI(t, s.vip, s.tracks, s.only)
			result, err := ResolveMobile(context.Background(), ResolveOptions{Url: "BV1234567890", Cookie: "SESSDATA=fixture", Cid: 456, QualityMode: "autoMax", Capabilities: avc1080, FallbackQn: s.fallback})
			if err != nil {
				t.Fatal(err)
			}
			if result.CurrentQn != s.want || result.Cid != 456 || result.CurrentPage != 2 {
				t.Fatalf("unexpected result %+v", result)
			}
			if result.VideoUrl == "" || result.AudioCodec != "mp4a.40.2" {
				t.Fatal("incomplete playable source")
			}
		})
	}
}
func TestResolveMissingCookieAndCancelled(t *testing.T) {
	if _, err := ResolveMobile(context.Background(), ResolveOptions{Url: "BV1234567890", QualityMode: "autoMax"}); err == nil {
		t.Fatal("anonymous resolution accepted")
	}
	fixtureAPI(t, true, []DashMediaTrack{track(80, "avc1.640028")}, false)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := ResolveMobile(ctx, ResolveOptions{Url: "BV1234567890", Cookie: "SESSDATA=fixture", QualityMode: "autoMax"}); err == nil {
		t.Fatal("cancelled resolution accepted")
	}
}

func TestResolveDeadlineIncludesMetadataRequests(t *testing.T) {
	fixtureAPI(t, true, []DashMediaTrack{track(80, "avc1.640028")}, false)
	bilibiliHTTPClient.Transport = fakeTransport(func(r *http.Request) (*http.Response, error) { <-r.Context().Done(); return nil, r.Context().Err() })
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := ResolveMobile(ctx, ResolveOptions{Url: "BV1234567890", Cookie: "SESSDATA=fixture", QualityMode: "autoMax"})
	if err == nil || (!errors.Is(err, context.DeadlineExceeded) && !strings.Contains(err.Error(), "deadline exceeded")) {
		t.Fatal(err)
	}
	if time.Since(start) > time.Second {
		t.Fatal("metadata ignored resolution deadline")
	}
}
