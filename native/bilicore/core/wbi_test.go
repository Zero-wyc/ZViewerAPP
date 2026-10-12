package core

import (
	"crypto/md5"
	"encoding/hex"
	"testing"
)

func TestWbiPublishedMixinVector(t *testing.T) {
	got := getWbiMixinKey("7cd084941338484aae1ad9425b84077c", "4932caff0ff746eab6f01bf08b70ac45")
	if got != "ea1db124af3c7062474693fa704f4ff8" {
		t.Fatalf("incorrect WBI permutation: %s", got)
	}
}
func TestWbiCanonicalUTF8AndSanitization(t *testing.T) {
	params := map[string]string{"keyword": "中文 搜索!()", "page": "2", "search_type": "video"}
	got := signParamsWithWbi(params, "abcdefghijklmnopqrstuvwxyzABCDEF", "GHIJKLMNOPQRSTUVWXYZ0123456789_-")
	query := "keyword=%E4%B8%AD%E6%96%87%20%E6%90%9C%E7%B4%A2&page=2&search_type=video&wts=" + got["wts"]
	digest := md5.Sum([]byte(query + "UVsc1ixGpYkF6dTJBRfXHjQtDCoNmMPn"))
	if got["w_rid"] != hex.EncodeToString(digest[:]) {
		t.Fatalf("incorrect Chinese search canonicalization: %v", got)
	}
	if got["keyword"] != "中文 搜索" || params["keyword"] != "中文 搜索!()" {
		t.Fatal("sanitization modified caller or signed wrong value")
	}
}
