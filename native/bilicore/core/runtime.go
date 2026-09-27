package core

import "time"

const userAgent = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

// Embedded builds never log cookies or signed media URLs.
func logf(string, ...any) {}
func nowISO() string      { return time.Now().Format(time.RFC3339) }

func ValidateCookie(cookie string) (*UserValidation, error) { return validateCookie(cookie) }
func GenerateQR() (*QRSession, error)                       { return generateQRCode() }
func PollQR(key string) (*QRPollResult, error)              { return pollQRStatus(key) }

func ResetSessionCaches() {
	videoInfoCacheMu.Lock()
	videoInfoCache = make(map[string]bilibiliVideoInfoCacheEntry)
	videoInfoCacheMu.Unlock()
	vipStatusCacheMu.Lock()
	vipStatusCache = make(map[string]vipStatusCacheEntry)
	vipStatusCacheMu.Unlock()
	clearWbiKeyCache()
}
