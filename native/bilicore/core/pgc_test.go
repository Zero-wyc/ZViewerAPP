package core

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
)

type fixtureTransport func(*http.Request) (*http.Response, error)

func (f fixtureTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func fixtureAPI(t *testing.T, play string, wrapper string) {
	t.Helper()
	content, err := os.ReadFile("../../../scripts/fixtures/pgc-contract.json")
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]json.RawMessage{}
	if err = json.Unmarshal(content, &fixtures); err != nil {
		t.Fatal(err)
	}
	old := bilibiliHTTPClient
	bilibiliHTTPClient = &http.Client{Transport: fixtureTransport(func(r *http.Request) (*http.Response, error) {
		var body string
		switch r.URL.Path {
		case "/pgc/view/web/season":
			body = `{"code":0,"result":` + string(fixtures["season"]) + `}`
		case "/pgc/player/web/playurl":
			if r.URL.Query().Get("ep_id") != "102" || r.URL.Query().Get("cid") != "1002" {
				t.Errorf("wrong ep/cid: %s", r.URL.RawQuery)
			}
			if wrapper == "nested" {
				body = `{"code":0,"data":{"result":` + string(fixtures[play]) + `}}`
			} else {
				body = `{"code":0,"result":` + string(fixtures[play]) + `}`
			}
		default:
			t.Fatalf("unexpected API %s", r.URL.Path)
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})}
	t.Cleanup(func() { bilibiliHTTPClient = old })
}
func TestPgcIdentity(t *testing.T) {
	for _, input := range []string{"ep102", "https://www.bilibili.com/bangumi/play/ep102?x=1", "ss900"} {
		kind, id := pgcIdentity(input)
		if kind == "" || id <= 0 {
			t.Errorf("rejected %s", input)
		}
	}
	for _, input := range []string{"ep0", "BV1234567890", "https://example.com/ep102", "ep9999999999999999999999"} {
		_, id := pgcIdentity(input)
		if id != 0 {
			t.Errorf("accepted %s", input)
		}
	}
}
func TestPgcEpPreviewAndNestedEnvelope(t *testing.T) {
	fixtureAPI(t, "preview", "nested")
	r, err := ResolveMobile(context.Background(), ResolveOptions{Url: "ep102", QualityMode: "autoMax", PreferMp4: true, Capabilities: []Capability{}})
	if err != nil {
		t.Fatal(err)
	}
	if r.Cid != 1002 || r.EpID != 102 || r.SeasonID != 900 || r.CurrentPage != 2 || r.Duration != 30 || !r.Preview || r.LoggedIn {
		t.Fatalf("incorrect PGC result: %+v", r)
	}
	if len(r.Pages) != 2 || r.Pages[1].EpID != 102 || r.Pages[1].Badge != "会员" {
		t.Fatal("season metadata lost")
	}
	_, err = ResolveMobile(context.Background(), ResolveOptions{Url: "ep102", Cid: 1001})
	var failure *ResolveError
	if !errors.As(err, &failure) || failure.Code != "CID_MISMATCH" {
		t.Fatalf("stale cid not rejected: %v", err)
	}
}
func TestPgcSeasonManualCapabilityAndAudio(t *testing.T) {
	fixtureAPI(t, "dash", "result")
	r, err := ResolveMobile(context.Background(), ResolveOptions{Url: "ss900", Cid: 1002, Qn: 64, QualityMode: "manual", Capabilities: []Capability{{Codec: "avc", MaxWidth: 1280, MaxHeight: 720, MaxFrameRate: 30}}})
	if err != nil {
		t.Fatal(err)
	}
	if r.CurrentQn != 64 || r.AudioCodec != "mp4a.40.2" || r.Cid != 1002 || r.CurrentPage != 2 {
		t.Fatalf("bad track selection %+v", r)
	}
	_, err = ResolveMobile(context.Background(), ResolveOptions{Url: "ep102", Qn: 80, QualityMode: "manual", Capabilities: []Capability{{Codec: "avc", MaxWidth: 1280, MaxHeight: 720, MaxFrameRate: 30}}})
	if err == nil {
		t.Fatal("manual unsupported track silently changed")
	}
}
func TestPgcBusinessErrors(t *testing.T) {
	for raw, want := range map[string]string{"[-10403]": "REGION_LIMITED", "[-404]": "EP_NOT_FOUND", "[-403]": "NO_PERMISSION", "[-101]": "NOT_LOGGED_IN"} {
		var e *ResolveError
		if !errors.As(mapPgcError(errors.New(raw)), &e) || e.Code != want {
			t.Errorf("wrong error %s", raw)
		}
	}
}

func TestShortLinkExpansionDoesNotSendCredentials(t *testing.T) {
	old := bilibiliHTTPClient
	defer func() { bilibiliHTTPClient = old }()
	bilibiliHTTPClient = &http.Client{Transport: fixtureTransport(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" {
			t.Fatal("short link sent credentials")
		}
		header := make(http.Header)
		code := 200
		if r.URL.Host == "b23.tv" {
			code = 302
			header.Set("Location", "https://www.bilibili.com/bangumi/play/ep102")
		}
		return &http.Response{StatusCode: code, Header: header, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})}
	expanded, err := expandMobileInput(context.Background(), "https://b23.tv/example")
	if err != nil || expanded != "https://www.bilibili.com/bangumi/play/ep102" {
		t.Fatalf("short link failed %s %v", expanded, err)
	}
}
