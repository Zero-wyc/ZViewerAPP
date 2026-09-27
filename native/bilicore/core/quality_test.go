package core

import "testing"

func track(id int, codec string) DashMediaTrack {
	return DashMediaTrack{ID: id, Codecs: codec, BaseUrl: "https://test.bilivideo.com/video.m4s", Width: 1920, Height: 1080, FrameRate: "30", Bandwidth: id * 100}
}

var avc1080 = []Capability{{Codec: "avc", MaxWidth: 1920, MaxHeight: 1080, MaxFrameRate: 30}}

func TestSelectAccountAndActualTracks(t *testing.T) {
	tracks := []DashMediaTrack{track(80, "avc1.640028"), track(112, "avc1.640028"), track(125, "avc1.640028"), track(126, "avc1.640028")}
	if got := SelectTrack(tracks, avc1080, false, 0, 0); got == nil || got.ID != 80 {
		t.Fatalf("ordinary account: %+v", got)
	}
	if got := SelectTrack(tracks, avc1080, true, 0, 0); got == nil || got.ID != 112 {
		t.Fatalf("VIP should choose highest standard: %+v", got)
	}
}
func TestCapabilityAndFallback(t *testing.T) {
	high := track(120, "hev1.1.6.L153.B0")
	high.Width = 3840
	high.Height = 2160
	tracks := []DashMediaTrack{high, track(80, "avc1.640028"), track(64, "avc1.640028"), track(32, "avc1.640028")}
	if got := SelectTrack(tracks, avc1080, true, 0, 0); got.ID != 80 {
		t.Fatalf("unsupported codec must be skipped: %+v", got)
	}
	if got := SelectTrack(tracks, avc1080, true, 0, 64); got.ID != 64 {
		t.Fatalf("fallback should be 720: %+v", got)
	}
	if got := SelectTrack(tracks[:2], avc1080, true, 64, 0); got != nil {
		t.Fatal("manual missing track must not pretend to match")
	}
	if got := SelectTrack([]DashMediaTrack{track(32, "avc1.640028")}, avc1080, true, 0, 64); got.ID != 32 {
		t.Fatal("no720 should retain actual lower track")
	}
}
func TestActualQnUsesSelectedTrack(t *testing.T) {
	raw := map[string]any{"quality": float64(120), "dash": map[string]any{"video": []any{map[string]any{"id": float64(80), "baseUrl": "https://test.bilivideo.com/x", "codecs": "avc1.640028"}}, "audio": []any{}}}
	result, err := normalizePlayUrlData(raw, 120, "avc")
	if err != nil || result.CurrentQn != 80 {
		t.Fatalf("reported qn must match track: %+v %v", result, err)
	}
}
func TestFrameRateAndResolution(t *testing.T) {
	high := track(116, "avc1.640028")
	high.FrameRate = "60000/1001"
	if got := SelectTrack([]DashMediaTrack{high}, avc1080, true, 0, 0); got != nil {
		t.Fatal("60fps must not pass a 30fps capability")
	}
	high = track(120, "avc1.640028")
	high.Width = 3840
	high.Height = 2160
	if got := SelectTrack([]DashMediaTrack{high}, avc1080, true, 0, 0); got != nil {
		t.Fatal("4K must not pass 1080 capability")
	}
}
