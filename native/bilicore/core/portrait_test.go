package core

import "testing"

func TestPortraitTrackUsesMeasuredOrientationLimits(t *testing.T) {
	caps := []Capability{{Codec: "avc", MaxWidth: 1920, MaxHeight: 1080, MaxFrameRate: 30}, {Codec: "avc", MaxWidth: 1080, MaxHeight: 1920, MaxFrameRate: 30}}
	for _, size := range []struct{ qn, width, height int }{{80, 1080, 1920}, {64, 720, 1280}, {32, 480, 852}} {
		track := DashMediaTrack{ID: size.qn, Width: size.width, Height: size.height, FrameRate: "24", Codecs: "avc1.640033", BaseUrl: "https://fixture.bilivideo.com/video.m4s"}
		if SelectTrack([]DashMediaTrack{track}, caps, false, size.qn, 0) == nil {
			t.Fatalf("portrait %d rejected", size.qn)
		}
		if size.qn >= 64 && SelectTrack([]DashMediaTrack{track}, caps[:1], false, size.qn, 0) != nil {
			t.Fatal("accepted a portrait size without measured support")
		}
		track.FrameRate = "60"
		if SelectTrack([]DashMediaTrack{track}, caps, false, size.qn, 0) != nil {
			t.Fatal("ignored frame-rate limits")
		}
	}
}
