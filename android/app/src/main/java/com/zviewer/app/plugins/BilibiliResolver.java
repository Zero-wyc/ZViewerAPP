package com.zviewer.app.plugins;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * B站视频解析器（参考 ZViewerCLI resolver.go / bilibili.go / wbi.go 移植）。
 *
 * 核心能力：
 * - WBI 签名（playurl / wbi/view 强制要求）
 * - VIP 状态校验（决定可用清晰度）
 * - DASH 轨道排序（按带宽 + 编码偏好）
 * - 备份 URL 收集（主 CDN 失败时供 /proxy 重试）
 * - 清晰度按 VIP 过滤
 *
 * 不依赖 Android Framework（仅 java.net / org.json），便于单元测试。
 */
public class BilibiliResolver {
    private static final String TAG = "BilibiliResolver";

    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // ===================== 常量（与 resolver.go 对齐） =====================

    // B站 API 请求超时：8 秒（平衡网络波动与快速失败，CLI 代理模式下本地请求应很快）
    private static final int BILIBILI_REQUEST_TIMEOUT_MS = 8000;
    private static final int MP4_MAX_QN = 80;
    private static final int DEFAULT_QN = 80;
    private static final int VIP_DEFAULT_QN = 120;
    private static final int QN_8K = 127;
    private static final int ANONYMOUS_MAX_QN = 32;

    private static final int[] VIP_ONLY_QNS = {112, 116, 120, 125, 126, 127};

    // WBI mixin key 字符抽取表（与 wbi.go 一致）
    private static final int[] WBI_MIXIN_KEY_ENC_TABLE = {
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
        27, 43, 5, 49, 33, 9, 20, 42, 19, 29, 28, 14, 7, 41, 12, 1
    };

    // qn 到标签/分辨率的兜底映射表
    private static final Map<Integer, String[]> QN_QUALITY_MAP = new HashMap<>();

    static {
        QN_QUALITY_MAP.put(127, new String[]{"8K 超高清", "7680x4320"});
        QN_QUALITY_MAP.put(126, new String[]{"杜比视界", "3840x2160"});
        QN_QUALITY_MAP.put(125, new String[]{"HDR 真彩", "3840x2160"});
        QN_QUALITY_MAP.put(120, new String[]{"4K 超清", "3840x2160"});
        QN_QUALITY_MAP.put(116, new String[]{"1080P60", "1920x1080"});
        QN_QUALITY_MAP.put(112, new String[]{"1080P+", "1920x1080"});
        QN_QUALITY_MAP.put(80, new String[]{"1080P", "1920x1080"});
        QN_QUALITY_MAP.put(74, new String[]{"720P60", "1280x720"});
        QN_QUALITY_MAP.put(64, new String[]{"720P", "1280x720"});
        QN_QUALITY_MAP.put(32, new String[]{"480P", "854x480"});
        QN_QUALITY_MAP.put(16, new String[]{"360P", "640x360"});
    }

    // ===================== 缓存 =====================

    private static final long WBI_KEY_TTL_MS = TimeUnit.MINUTES.toMillis(30);
    private static final long VIDEO_INFO_CACHE_TTL_MS = TimeUnit.MINUTES.toMillis(2);
    private static final long VIP_CACHE_TTL_MS = TimeUnit.MINUTES.toMillis(5);

    private static class WbiKeyPair {
        final String imgKey;
        final String subKey;
        final long fetchedAt;

        WbiKeyPair(String imgKey, String subKey, long fetchedAt) {
            this.imgKey = imgKey;
            this.subKey = subKey;
            this.fetchedAt = fetchedAt;
        }
    }

    private static class VideoInfoCacheEntry {
        final VideoInfo info;
        final long cachedAt;

        VideoInfoCacheEntry(VideoInfo info, long cachedAt) {
            this.info = info;
            this.cachedAt = cachedAt;
        }
    }

    private static class VipCacheEntry {
        final boolean isVip;
        final long cachedAt;

        VipCacheEntry(boolean isVip, long cachedAt) {
            this.isVip = isVip;
            this.cachedAt = cachedAt;
        }
    }

    /** nav 接口合并请求结果：VIP 状态 + WBI keys */
    private static class NavInfo {
        final boolean isVip;
        final String imgKey;
        final String subKey;

        NavInfo(boolean isVip, String imgKey, String subKey) {
            this.isVip = isVip;
            this.imgKey = imgKey;
            this.subKey = subKey;
        }
    }

    private static final Map<String, WbiKeyPair> wbiKeyCache = new ConcurrentHashMap<>();
    private static final Map<String, VideoInfoCacheEntry> videoInfoCache = new ConcurrentHashMap<>();
    private static final Map<String, VipCacheEntry> vipStatusCache = new ConcurrentHashMap<>();

    // ===================== 数据结构 =====================

    public static class DashMediaTrack {
        public final String baseUrl;
        public final List<String> backupUrls;
        public final int bandwidth;
        public final String codecs;
        public final int id;

        public DashMediaTrack(String baseUrl, List<String> backupUrls, int bandwidth, String codecs, int id) {
            this.baseUrl = baseUrl;
            this.backupUrls = backupUrls != null ? backupUrls : new ArrayList<>();
            this.bandwidth = bandwidth;
            this.codecs = codecs;
            this.id = id;
        }
    }

    public static class VideoInfo {
        public final String bvid;
        public final long aid;
        public final long cid;
        public final String title;
        public final int duration;
        public final List<VideoPage> pages;

        public VideoInfo(String bvid, long aid, long cid, String title, int duration, List<VideoPage> pages) {
            this.bvid = bvid;
            this.aid = aid;
            this.cid = cid;
            this.title = title;
            this.duration = duration;
            this.pages = pages != null ? pages : new ArrayList<>();
        }
    }

    public static class VideoPage {
        public final long cid;
        public final int page;
        public final String part;
        public final int duration;

        public VideoPage(long cid, int page, String part, int duration) {
            this.cid = cid;
            this.page = page;
            this.part = part;
            this.duration = duration;
        }
    }

    public static class QualityItem {
        public final int id;
        public final String label;
        public final String resolution;

        public QualityItem(int id, String label, String resolution) {
            this.id = id;
            this.label = label;
            this.resolution = resolution;
        }

        public JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("id", id);
                o.put("label", label);
                if (resolution != null) o.put("resolution", resolution);
            } catch (Exception ignored) {}
            return o;
        }
    }

    public static class ResolveResult {
        public String title;
        public int duration;
        public long cid;
        public String videoUrl;
        public String audioUrl;
        public String videoCodec;
        public String audioCodec;
        public String format; // "dash" or "mp4"
        public boolean loggedIn;
        public int vipStatus;
        public int currentQn;
        public List<QualityItem> acceptQuality;
        public List<VideoPage> pages;
        public int currentPage;
        public List<String> videoBackupUrls;
        public List<String> audioBackupUrls;
    }

    public static class ResolveOptions {
        public String bvid;
        public String cookie;
        public int qn;
        public boolean preferMp4;
        public boolean forceDash;
        public long cid;
        public int page;
        public boolean skipCdnCheck;
    }

    public static class ResolveException extends Exception {
        public final String code;
        public ResolveException(String message, String code) {
            super(message);
            this.code = code;
        }
    }

    // ===================== HTTP 工具 =====================

    private static HttpURLConnection openConnection(String urlStr, String method, String cookie) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setRequestProperty("User-Agent", USER_AGENT);
        conn.setRequestProperty("Referer", "https://www.bilibili.com");
        conn.setRequestProperty("Origin", "https://www.bilibili.com");
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        if (cookie != null && !cookie.isEmpty()) {
            conn.setRequestProperty("Cookie", cookie);
        }
        conn.setConnectTimeout(BILIBILI_REQUEST_TIMEOUT_MS);
        conn.setReadTimeout(BILIBILI_REQUEST_TIMEOUT_MS);
        return conn;
    }

    private static String readBody(HttpURLConnection conn) throws Exception {
        BufferedReader reader = new BufferedReader(
            new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line);
        }
        reader.close();
        return sb.toString();
    }

    private static String readErrorBody(HttpURLConnection conn) {
        try {
            if (conn.getErrorStream() == null) return "";
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * 封装对 B站 API 的请求：自动补充头、超时、错误处理。
     * 返回 data 字段解析后的 JSONObject。
     */
    private static JSONObject bilibiliFetch(String api, String cookie) throws Exception {
        HttpURLConnection conn = null;
        try {
            conn = openConnection(api, "GET", cookie);
            int code = conn.getResponseCode();
            String body;
            if (code >= 400) {
                body = readErrorBody(conn);
                throw new Exception("B站 API 请求失败 [" + code + "]: " + body);
            }
            body = readBody(conn);
            JSONObject payload = new JSONObject(body);
            int bizCode = payload.optInt("code", -1);
            if (bizCode != 0) {
                String msg = payload.optString("message", "");
                throw new Exception("B站 API 业务错误 [" + bizCode + "] " + msg + ": " + api);
            }
            return payload.optJSONObject("data");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // ===================== WBI 签名 =====================

    private static String extractKeyFromWbiUrl(String raw) {
        try {
            int lastSlash = raw.lastIndexOf('/');
            if (lastSlash < 0) return "";
            String filename = raw.substring(lastSlash + 1);
            if (filename.endsWith(".png")) {
                return filename.substring(0, filename.length() - 4);
            }
            return filename;
        } catch (Exception e) {
            return "";
        }
    }

    private static String getWbiMixinKey(String imgKey, String subKey) {
        String raw = imgKey + subKey;
        StringBuilder sb = new StringBuilder();
        for (int idx : WBI_MIXIN_KEY_ENC_TABLE) {
            if (idx < raw.length()) {
                sb.append(raw.charAt(idx));
            }
        }
        return sb.length() >= 32 ? sb.substring(0, 32) : sb.toString();
    }

    /**
     * 对请求参数进行 WBI 签名，返回增加 wts、w_rid 后的参数 Map。
     */
    private static Map<String, String> signParamsWithWbi(Map<String, String> params, String imgKey, String subKey) {
        String mixinKey = getWbiMixinKey(imgKey, subKey);
        Map<String, String> signed = new TreeMap<>(params);
        signed.put("wts", String.valueOf(System.currentTimeMillis() / 1000L));

        // 按键名排序并编码，空值不参与签名
        List<String> keys = new ArrayList<>();
        for (Map.Entry<String, String> e : signed.entrySet()) {
            if (e.getValue() != null && !e.getValue().isEmpty()) {
                keys.add(e.getKey());
            }
        }
        Collections.sort(keys);

        StringBuilder qs = new StringBuilder();
        for (int i = 0; i < keys.size(); i++) {
            if (i > 0) qs.append('&');
            qs.append(urlEncode(keys.get(i)));
            qs.append('=');
            qs.append(urlEncode(signed.get(keys.get(i))));
        }

        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest((qs.toString() + mixinKey).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) {
                hex.append(String.format(Locale.US, "%02x", b));
            }
            signed.put("w_rid", hex.toString());
        } catch (Exception e) {
            Log.e(TAG, "WBI MD5 签名失败", e);
        }
        return signed;
    }

    private static String buildQueryString(Map<String, String> params) {
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (Map.Entry<String, String> e : params.entrySet()) {
            if (!first) sb.append('&');
            sb.append(urlEncode(e.getKey()));
            sb.append('=');
            sb.append(urlEncode(e.getValue()));
            first = false;
        }
        return sb.toString();
    }

    private static String urlEncode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private static String wbiCacheKey(String cookie) {
        if (cookie == null || cookie.isEmpty()) return "anonymous";
        // 简单按 DedeUserID 提取，避免每次都哈希整个 cookie
        Matcher m = Pattern.compile("(?:^|;\\s*)DedeUserID=(\\d+)").matcher(cookie);
        if (m.find()) return "mid:" + m.group(1);
        return "cookie:" + Integer.toHexString(cookie.hashCode());
    }

    private static String[] fetchWbiKeys(String cookie) throws Exception {
        JSONObject data = bilibiliFetch("https://api.bilibili.com/x/web-interface/nav", cookie);
        if (data == null) throw new Exception("nav 接口返回空数据");
        JSONObject wbiImg = data.optJSONObject("wbi_img");
        if (wbiImg == null) throw new Exception("nav 接口未返回 wbi_img");
        String imgUrl = wbiImg.optString("img_url", "");
        String subUrl = wbiImg.optString("sub_url", "");
        if (imgUrl.isEmpty() || subUrl.isEmpty()) {
            throw new Exception("nav 接口 wbi_img 字段为空");
        }
        String imgKey = extractKeyFromWbiUrl(imgUrl);
        String subKey = extractKeyFromWbiUrl(subUrl);
        if (imgKey.isEmpty() || subKey.isEmpty()) {
            throw new Exception("无法从 WBI 图片 URL 提取 key");
        }
        return new String[]{imgKey, subKey};
    }

    private static String[] getWbiKeys(String cookie) throws Exception {
        String key = wbiCacheKey(cookie);
        WbiKeyPair cached = wbiKeyCache.get(key);
        if (cached != null && System.currentTimeMillis() - cached.fetchedAt < WBI_KEY_TTL_MS) {
            return new String[]{cached.imgKey, cached.subKey};
        }
        String[] keys = fetchWbiKeys(cookie);
        wbiKeyCache.put(key, new WbiKeyPair(keys[0], keys[1], System.currentTimeMillis()));
        return keys;
    }

    private static void clearWbiKeyCache() {
        wbiKeyCache.clear();
    }

    // ===================== VIP 校验 =====================

    private static String vipCacheKey(String cookie) {
        return wbiCacheKey(cookie);
    }

    private static boolean getVipStatus(String cookie) {
        if (cookie == null || cookie.trim().isEmpty()) return false;
        String key = vipCacheKey(cookie);
        VipCacheEntry cached = vipStatusCache.get(key);
        if (cached != null && System.currentTimeMillis() - cached.cachedAt < VIP_CACHE_TTL_MS) {
            return cached.isVip;
        }
        try {
            JSONObject data = bilibiliFetch("https://api.bilibili.com/x/web-interface/nav", cookie);
            if (data == null) return false;
            boolean isLogin = data.optBoolean("isLogin", false);
            int vipStatus = data.optInt("vipStatus", 0);
            int vipType = data.optInt("vipType", 0);
            boolean isVip = isLogin && (vipStatus == 1 || vipType > 0);
            vipStatusCache.put(key, new VipCacheEntry(isVip, System.currentTimeMillis()));
            return isVip;
        } catch (Exception e) {
            Log.w(TAG, "VIP 校验失败: " + e.getMessage());
            return false;
        }
    }

    /**
     * 合并 nav 请求：一次调用同时获取 VIP 状态和 WBI keys。
     *
     * 性能优化：resolveBilibiliVideo 中需要 VIP 状态（过滤清晰度）和 WBI keys（签名 view/playurl）。
     * 原实现分别调用 getVipStatus 和 getWbiKeys，各自请求一次 nav 接口，产生 2 个 RTT。
     * 本方法合并为 1 次 nav 请求，同时更新两个缓存，节省 1 个 RTT（约 200-500ms）。
     *
     * @return NavInfo 包含 isVip, imgKey, subKey；nav 失败时返回 null（调用方降级处理）
     */
    private static NavInfo fetchNavInfo(String cookie) {
        if (cookie == null || cookie.trim().isEmpty()) return null;
        try {
            JSONObject data = bilibiliFetch("https://api.bilibili.com/x/web-interface/nav", cookie);
            if (data == null) return null;

            // 提取 VIP 状态
            boolean isLogin = data.optBoolean("isLogin", false);
            int vipStatus = data.optInt("vipStatus", 0);
            int vipType = data.optInt("vipType", 0);
            boolean isVip = isLogin && (vipStatus == 1 || vipType > 0);

            // 提取 WBI keys
            JSONObject wbiImg = data.optJSONObject("wbi_img");
            if (wbiImg == null) return null;
            String imgUrl = wbiImg.optString("img_url", "");
            String subUrl = wbiImg.optString("sub_url", "");
            if (imgUrl.isEmpty() || subUrl.isEmpty()) return null;
            String imgKey = extractKeyFromWbiUrl(imgUrl);
            String subKey = extractKeyFromWbiUrl(subUrl);
            if (imgKey.isEmpty() || subKey.isEmpty()) return null;

            // 更新两个缓存
            String cacheKey = wbiCacheKey(cookie);
            vipStatusCache.put(cacheKey, new VipCacheEntry(isVip, System.currentTimeMillis()));
            wbiKeyCache.put(cacheKey, new WbiKeyPair(imgKey, subKey, System.currentTimeMillis()));

            return new NavInfo(isVip, imgKey, subKey);
        } catch (Exception e) {
            Log.w(TAG, "nav 合并请求失败: " + e.getMessage());
            return null;
        }
    }

    // ===================== 清晰度过滤 =====================

    private static boolean intSliceContains(int[] arr, int v) {
        for (int x : arr) {
            if (x == v) return true;
        }
        return false;
    }

    private static List<QualityItem> filterQualitiesByVip(List<QualityItem> list, boolean isVip, boolean hasCookie) {
        if (isVip) return list;
        List<QualityItem> filtered = new ArrayList<>();
        if (!hasCookie) {
            for (QualityItem q : list) {
                if (q.id <= ANONYMOUS_MAX_QN) filtered.add(q);
            }
            if (filtered.isEmpty()) {
                filtered.add(new QualityItem(32, "480P", "854x480"));
                filtered.add(new QualityItem(16, "360P", "640x360"));
            }
            return filtered;
        }
        for (QualityItem q : list) {
            if (!intSliceContains(VIP_ONLY_QNS, q.id)) filtered.add(q);
        }
        if (filtered.isEmpty()) {
            filtered.add(new QualityItem(80, "1080P", "1920x1080"));
        }
        return filtered;
    }

    private static int computeFnval(boolean isVip, int qn) {
        int dash = 16;
        int fourK = 64;
        int eightK = 2048;
        if (!isVip) return dash;
        int fnval = dash | fourK;
        if (qn == QN_8K) fnval |= eightK;
        return fnval;
    }

    private static int getDefaultQn(boolean isVip, boolean hasCookie) {
        if (!hasCookie) return ANONYMOUS_MAX_QN;
        if (isVip) return VIP_DEFAULT_QN;
        return DEFAULT_QN;
    }

    private static List<QualityItem> buildAcceptQuality(JSONArray acceptQuality, JSONArray acceptDescription, int currentQn) {
        List<Integer> qns = new ArrayList<>();
        if (acceptQuality != null) {
            for (int i = 0; i < acceptQuality.length(); i++) {
                qns.add(acceptQuality.optInt(i));
            }
        }
        if (qns.isEmpty()) {
            qns.add(currentQn);
        }

        // accept_description 可能是两种格式（与 ZViewerCLI resolver.go 对齐）：
        // 1. 对象数组：[{qn: 80, desc: "1080P"}, ...] → 构建 qn→desc 映射
        // 2. 字符串数组：["1080P", "720P", ...] → 按 accept_quality 顺序对应
        Map<Integer, String> descByQn = new HashMap<>();
        List<String> descList = new ArrayList<>();
        if (acceptDescription != null) {
            for (int i = 0; i < acceptDescription.length(); i++) {
                JSONObject obj = acceptDescription.optJSONObject(i);
                if (obj != null) {
                    // 对象数组格式
                    int qn = obj.optInt("qn", 0);
                    String desc = obj.optString("desc", "");
                    if (qn != 0 && !desc.isEmpty()) {
                        descByQn.put(qn, desc);
                    }
                } else {
                    // 字符串数组格式
                    String s = acceptDescription.optString(i);
                    if (!s.isEmpty()) descList.add(s);
                }
            }
        }

        List<QualityItem> items = new ArrayList<>();
        for (int qn : qns) {
            String[] fallback = QN_QUALITY_MAP.get(qn);
            String label = fallback != null ? fallback[0] : String.valueOf(qn);
            String resolution = fallback != null ? fallback[1] : null;
            // 优先使用 descByQn（对象数组格式），其次使用 descList（字符串数组格式）
            if (descByQn.containsKey(qn)) {
                String desc = descByQn.get(qn);
                if (desc != null && !desc.isEmpty()) label = desc;
            } else if (!descList.isEmpty() && acceptQuality != null) {
                int idx = -1;
                for (int i = 0; i < acceptQuality.length(); i++) {
                    if (acceptQuality.optInt(i) == qn) {
                        idx = i;
                        break;
                    }
                }
                if (idx >= 0 && idx < descList.size()) {
                    String desc = descList.get(idx);
                    if (!desc.isEmpty()) label = desc;
                }
            }
            items.add(new QualityItem(qn, label, resolution));
        }
        return items;
    }

    // ===================== 视频信息 =====================

    private static VideoInfo getVideoInfoWbi(String bvid, String cookie) throws Exception {
        String[] keys = getWbiKeys(cookie);
        Map<String, String> params = new TreeMap<>();
        params.put("bvid", bvid);
        Map<String, String> signed = signParamsWithWbi(params, keys[0], keys[1]);
        String api = "https://api.bilibili.com/x/web-interface/wbi/view?" + buildQueryString(signed);
        JSONObject data = bilibiliFetch(api, cookie);
        return parseVideoInfo(data, bvid);
    }

    private static VideoInfo getVideoInfoLegacy(String bvid, String cookie) throws Exception {
        String api = "https://api.bilibili.com/x/web-interface/view?bvid=" + urlEncode(bvid);
        JSONObject data = bilibiliFetch(api, cookie);
        return parseVideoInfo(data, bvid);
    }

    private static VideoInfo parseVideoInfo(JSONObject data, String fallbackBvid) {
        if (data == null) return null;
        String bvid = data.optString("bvid", fallbackBvid);
        long aid = data.optLong("aid", 0);
        long cid = data.optLong("cid", 0);
        String title = data.optString("title", "");
        int duration = data.optInt("duration", 0);
        List<VideoPage> pages = new ArrayList<>();
        JSONArray pagesArr = data.optJSONArray("pages");
        if (pagesArr != null) {
            for (int i = 0; i < pagesArr.length(); i++) {
                JSONObject p = pagesArr.optJSONObject(i);
                if (p != null) {
                    pages.add(new VideoPage(
                        p.optLong("cid", 0),
                        p.optInt("page", i + 1),
                        p.optString("part", ""),
                        p.optInt("duration", 0)
                    ));
                }
            }
        }
        return new VideoInfo(bvid, aid, cid, title, duration, pages);
    }

    private static VideoInfo getVideoInfo(String bvid, String cookie) throws Exception {
        String cacheKey = bvid + "|" + (cookie == null ? "" : Integer.toHexString(cookie.hashCode()));
        VideoInfoCacheEntry cached = videoInfoCache.get(cacheKey);
        if (cached != null && System.currentTimeMillis() - cached.cachedAt < VIDEO_INFO_CACHE_TTL_MS) {
            return cached.info;
        }
        VideoInfo info;
        try {
            info = getVideoInfoWbi(bvid, cookie);
        } catch (Exception e) {
            Log.w(TAG, "WBI view 失败，降级到未签名接口: " + e.getMessage());
            clearWbiKeyCache();
            info = getVideoInfoLegacy(bvid, cookie);
        }
        if (info != null) {
            videoInfoCache.put(cacheKey, new VideoInfoCacheEntry(info, System.currentTimeMillis()));
        }
        return info;
    }

    // ===================== 播放地址 =====================

    private static String detectCodec(String codecs) {
        if (codecs == null) return "unknown";
        String c = codecs.trim();
        if (c.startsWith("avc")) return "avc";
        if (c.startsWith("hvc") || c.startsWith("hev")) return "hevc";
        if (c.startsWith("av01")) return "av1";
        return "unknown";
    }

    private static List<DashMediaTrack> sortByBandwidthDesc(List<DashMediaTrack> tracks) {
        List<DashMediaTrack> result = new ArrayList<>(tracks);
        for (int i = 0; i < result.size() - 1; i++) {
            for (int j = i + 1; j < result.size(); j++) {
                if (result.get(i).bandwidth < result.get(j).bandwidth) {
                    DashMediaTrack tmp = result.get(i);
                    result.set(i, result.get(j));
                    result.set(j, tmp);
                }
            }
        }
        return result;
    }

    private static List<DashMediaTrack> sortDashTracks(List<DashMediaTrack> tracks, String codec) {
        List<DashMediaTrack> sorted = sortByBandwidthDesc(tracks);
        if (sorted.isEmpty()) return sorted;
        String preferred = codec;
        if (preferred == null || preferred.isEmpty() || "auto".equals(preferred)) {
            preferred = "avc";
        }
        List<DashMediaTrack> matched = new ArrayList<>();
        for (DashMediaTrack t : sorted) {
            if (preferred.equals(detectCodec(t.codecs))) {
                matched.add(t);
            }
        }
        return matched.isEmpty() ? sorted : matched;
    }

    private static String rewriteMcdnPort(String raw) {
        try {
            URL u = new URL(raw);
            String host = u.getHost();
            if (host != null && host.endsWith(".mcdn.bilivideo.cn") && u.getPort() == 8082) {
                // 去掉 8082 端口：部分网络环境无法连接 B站 mcdn P2P CDN 的 8082 端口
                return new URL(u.getProtocol(), host, -1, u.getFile()).toString();
            }
        } catch (Exception ignored) {}
        return raw;
    }

    private static DashMediaTrack normalizeDashMedia(JSONObject raw) {
        String baseUrl = "";
        if (raw.has("baseUrl")) baseUrl = raw.optString("baseUrl");
        else if (raw.has("base_url")) baseUrl = raw.optString("base_url");
        baseUrl = rewriteMcdnPort(baseUrl);

        List<String> backupUrls = new ArrayList<>();
        JSONArray backupArr = raw.optJSONArray("backupUrl");
        if (backupArr == null) backupArr = raw.optJSONArray("backup_url");
        if (backupArr != null) {
            for (int i = 0; i < backupArr.length(); i++) {
                String s = backupArr.optString(i);
                if (!s.isEmpty()) backupUrls.add(rewriteMcdnPort(s));
            }
        }

        int bandwidth = raw.optInt("bandwidth", 0);
        String codecs = raw.optString("codecs", "");
        int id = raw.optInt("id", 0);
        return new DashMediaTrack(baseUrl, backupUrls, bandwidth, codecs, id);
    }

    private static List<QualityItem> qualityItemsFromJson(JSONArray arr) {
        List<QualityItem> items = new ArrayList<>();
        if (arr == null) return items;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject q = arr.optJSONObject(i);
            if (q != null) {
                items.add(new QualityItem(
                    q.optInt("id", 0),
                    q.optString("label", ""),
                    q.optString("resolution", null)
                ));
            }
        }
        return items;
    }

    private static boolean qualityListContains(List<QualityItem> list, int qn) {
        for (QualityItem q : list) {
            if (q.id == qn) return true;
        }
        return false;
    }

    /**
     * 获取播放地址（WBI 签名优先，失败降级到未签名接口）。
     */
    private static JSONObject getPlayUrl(String bvid, long cid, String cookie, int qn, boolean isVip, String codec) throws Exception {
        int requestedQn = qn == 0 ? DEFAULT_QN : qn;
        int fnval = computeFnval(isVip, requestedQn);

        Map<String, String> params = new TreeMap<>();
        params.put("bvid", bvid);
        params.put("cid", String.valueOf(cid));
        params.put("qn", String.valueOf(requestedQn));
        params.put("fnver", "0");
        params.put("fnval", String.valueOf(fnval));
        params.put("fourk", "1");

        JSONObject data;
        try {
            String[] keys = getWbiKeys(cookie);
            Map<String, String> signed = signParamsWithWbi(params, keys[0], keys[1]);
            String api = "https://api.bilibili.com/x/player/wbi/playurl?" + buildQueryString(signed);
            data = bilibiliFetch(api, cookie);
        } catch (Exception e) {
            Log.w(TAG, "WBI playurl 失败，降级到未签名接口: " + e.getMessage());
            clearWbiKeyCache();
            String api = "https://api.bilibili.com/x/player/playurl?" + buildQueryString(params);
            data = bilibiliFetch(api, cookie);
        }
        return data;
    }

    /**
     * 获取 MP4 直链（fnval=1 + platform=html5）。
     */
    private static JSONObject getMp4PlayUrl(String bvid, long cid, String cookie, int qn, boolean isVip) throws Exception {
        int requestedQn = qn == 0 ? DEFAULT_QN : qn;
        int fnval = 1; // MP4
        Map<String, String> params = new TreeMap<>();
        params.put("bvid", bvid);
        params.put("cid", String.valueOf(cid));
        params.put("qn", String.valueOf(requestedQn));
        params.put("fnver", "0");
        params.put("fnval", String.valueOf(fnval));
        params.put("fourk", "1");
        params.put("platform", "html5");
        params.put("high_quality", "1");

        try {
            String[] keys = getWbiKeys(cookie);
            Map<String, String> signed = signParamsWithWbi(params, keys[0], keys[1]);
            String api = "https://api.bilibili.com/x/player/wbi/playurl?" + buildQueryString(signed);
            return bilibiliFetch(api, cookie);
        } catch (Exception e) {
            Log.w(TAG, "WBI MP4 playurl 失败，降级: " + e.getMessage());
            clearWbiKeyCache();
            String api = "https://api.bilibili.com/x/player/playurl?" + buildQueryString(params);
            return bilibiliFetch(api, cookie);
        }
    }

    private static List<String> collectBackupUrls(DashMediaTrack track) {
        List<String> urls = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (track != null) {
            if (!track.baseUrl.isEmpty() && seen.add(track.baseUrl)) {
                urls.add(track.baseUrl);
            }
            for (String u : track.backupUrls) {
                if (!u.isEmpty() && seen.add(u)) {
                    urls.add(u);
                }
            }
        }
        return urls;
    }

    private static List<QualityItem> narrowAcceptQualityForMp4(List<QualityItem> list) {
        List<QualityItem> filtered = new ArrayList<>();
        for (QualityItem q : list) {
            if (q.id <= MP4_MAX_QN) filtered.add(q);
        }
        if (!filtered.isEmpty()) return filtered;
        String[] q32 = QN_QUALITY_MAP.get(32);
        String[] q16 = QN_QUALITY_MAP.get(16);
        filtered.add(new QualityItem(32, q32 != null ? q32[0] : "480P", q32 != null ? q32[1] : "854x480"));
        filtered.add(new QualityItem(16, q16 != null ? q16[0] : "360P", q16 != null ? q16[1] : "640x360"));
        return filtered;
    }

    private static int getCurrentPageDuration(VideoInfo info, long cid) {
        if (info.pages != null && !info.pages.isEmpty()) {
            long targetCid = cid == 0 ? info.cid : cid;
            for (VideoPage p : info.pages) {
                if (p.cid == targetCid) return p.duration;
            }
            return info.pages.get(0).duration;
        }
        return info.duration;
    }

    // ===================== 主解析入口 =====================

    /**
     * 编排完整解析流程（与 ZViewerCLI ResolveBilibiliVideo 对齐）。
     */
    public static ResolveResult resolveBilibiliVideo(ResolveOptions opts) throws Exception {
        String bvid = opts.bvid;
        if (bvid == null || bvid.isEmpty()) {
            throw new ResolveException("缺少 bvid", "INVALID_INPUT");
        }
        Log.i(TAG, "[bilibili] 开始解析: " + bvid + " qn=" + opts.qn + " preferMp4=" + opts.preferMp4 + " forceDash=" + opts.forceDash);

        String cookie = opts.cookie != null ? opts.cookie.trim() : "";
        boolean hasCookie = !cookie.isEmpty();

        // 1. 合并 nav 请求：一次获取 VIP 状态 + WBI keys（节省 1 个 RTT）
        //    nav 失败时降级：getVideoInfo 内部会降级到未签名 view 接口，isVip 默认 false
        boolean isVip = false;
        if (hasCookie) {
            NavInfo navInfo = fetchNavInfo(cookie);
            if (navInfo != null) {
                isVip = navInfo.isVip;
            }
        }

        // 2. 获取视频信息（WBI keys 已由 fetchNavInfo 缓存，不会重复请求 nav）
        VideoInfo info = getVideoInfo(bvid, cookie);
        if (info == null) {
            throw new ResolveException("获取视频信息失败", "INFO_FAILED");
        }

        // 3. 确定当前播放分集
        long effectiveCid = info.cid;
        int currentPage = 1;
        if (opts.cid != 0) {
            effectiveCid = opts.cid;
            if (info.pages != null) {
                for (VideoPage p : info.pages) {
                    if (p.cid == opts.cid) {
                        currentPage = p.page;
                        break;
                    }
                }
            }
        } else if (opts.page > 0 && info.pages != null && !info.pages.isEmpty()) {
            int idx = opts.page - 1;
            if (idx >= info.pages.size()) idx = info.pages.size() - 1;
            if (info.pages.get(idx).cid != 0) {
                effectiveCid = info.pages.get(idx).cid;
                currentPage = info.pages.get(idx).page;
            }
        } else if (info.pages != null && !info.pages.isEmpty()) {
            for (VideoPage p : info.pages) {
                if (p.cid == info.cid) {
                    currentPage = p.page;
                    break;
                }
            }
        }

        int defaultQn = getDefaultQn(isVip, hasCookie);
        int requestedQn = opts.qn == 0 ? defaultQn : opts.qn;

        // 4. 获取播放地址
        JSONObject playData = getPlayUrl(info.bvid, effectiveCid, cookie, requestedQn, isVip, null);
        if (playData == null) {
            throw new ResolveException("无法获取播放地址", "NO_PERMISSION");
        }

        int actualQn = playData.optInt("quality", requestedQn);
        JSONArray acceptQualityRaw = playData.optJSONArray("accept_quality");
        JSONArray acceptDescription = playData.optJSONArray("accept_description");
        List<QualityItem> acceptQuality = buildAcceptQuality(acceptQualityRaw, acceptDescription, actualQn);
        acceptQuality = filterQualitiesByVip(acceptQuality, isVip, hasCookie);

        // 5. 清晰度匹配
        int effectiveQn = actualQn;
        if (effectiveQn != 0 && !qualityListContains(acceptQuality, effectiveQn) && !acceptQuality.isEmpty()) {
            effectiveQn = acceptQuality.get(0).id;
        }

        // 6. 若请求的 qn 与实际不符，重新请求
        if (effectiveQn != 0 && effectiveQn != actualQn) {
            try {
                JSONObject refetched = getPlayUrl(info.bvid, effectiveCid, cookie, effectiveQn, isVip, null);
                if (refetched != null) {
                    playData = refetched;
                    actualQn = playData.optInt("quality", effectiveQn);
                    acceptQualityRaw = playData.optJSONArray("accept_quality");
                    acceptDescription = playData.optJSONArray("accept_description");
                    acceptQuality = buildAcceptQuality(acceptQualityRaw, acceptDescription, actualQn);
                    acceptQuality = filterQualitiesByVip(acceptQuality, isVip, hasCookie);
                }
            } catch (Exception ignored) {}
        }

        // 7. preferMp4 优先路径（forceDash 为 true 时跳过）
        if (opts.preferMp4 && !opts.forceDash) {
            try {
                JSONObject mp4Data = getMp4PlayUrl(info.bvid, effectiveCid, cookie, effectiveQn, isVip);
                if (mp4Data != null) {
                    JSONArray durl = mp4Data.optJSONArray("durl");
                    if (durl != null && durl.length() > 0) {
                        JSONObject first = durl.getJSONObject(0);
                        String mp4Url = first.optString("url", "");
                        if (!mp4Url.isEmpty()) {
                            int mp4Qn = mp4Data.optInt("quality", effectiveQn);
                            List<QualityItem> mp4Accept = narrowAcceptQualityForMp4(acceptQuality);
                            ResolveResult result = new ResolveResult();
                            result.title = info.title;
                            result.duration = getCurrentPageDuration(info, effectiveCid);
                            result.cid = effectiveCid;
                            result.videoUrl = mp4Url;
                            result.format = "mp4";
                            result.loggedIn = hasCookie;
                            result.vipStatus = isVip ? 1 : 0;
                            result.currentQn = mp4Qn;
                            result.acceptQuality = mp4Accept;
                            result.pages = info.pages;
                            result.currentPage = currentPage;
                            result.videoBackupUrls = new ArrayList<>();
                            result.audioBackupUrls = new ArrayList<>();
                            Log.i(TAG, "[bilibili] 解析完成 (MP4): " + bvid + " qn=" + mp4Qn);
                            return result;
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "MP4 降级失败: " + e.getMessage());
            }
        }

        // 8. DASH 路径
        JSONObject dash = playData.optJSONObject("dash");
        if (dash != null) {
            JSONArray videoArr = dash.optJSONArray("video");
            JSONArray audioArr = dash.optJSONArray("audio");

            if (videoArr != null && videoArr.length() > 0) {
                List<DashMediaTrack> allTracks = new ArrayList<>();
                for (int i = 0; i < videoArr.length(); i++) {
                    JSONObject m = videoArr.optJSONObject(i);
                    if (m != null) allTracks.add(normalizeDashMedia(m));
                }

                // 按 qn 过滤
                List<DashMediaTrack> matchedQn = new ArrayList<>();
                for (DashMediaTrack t : allTracks) {
                    if (t.id == actualQn) matchedQn.add(t);
                }
                List<DashMediaTrack> tracksToSort = matchedQn.isEmpty() ? allTracks : matchedQn;
                List<DashMediaTrack> video = sortDashTracks(tracksToSort, null);

                List<DashMediaTrack> audio = new ArrayList<>();
                if (audioArr != null) {
                    for (int i = 0; i < audioArr.length(); i++) {
                        JSONObject m = audioArr.optJSONObject(i);
                        if (m != null) audio.add(normalizeDashMedia(m));
                    }
                }
                audio = sortByBandwidthDesc(audio);

                if (!video.isEmpty()) {
                    DashMediaTrack bestVideo = video.get(0);
                    DashMediaTrack bestAudio = audio.isEmpty() ? null : audio.get(0);

                    List<String> videoBackupUrls = collectBackupUrls(bestVideo);
                    List<String> audioBackupUrls = collectBackupUrls(bestAudio);

                    // CLI 代理模式：SkipCdnCheck=true，直接使用 BaseUrl，不探测 CDN 可达性
                    ResolveResult result = new ResolveResult();
                    result.title = info.title;
                    result.duration = getCurrentPageDuration(info, effectiveCid);
                    result.cid = effectiveCid;
                    result.videoUrl = bestVideo.baseUrl;
                    result.audioUrl = bestAudio != null ? bestAudio.baseUrl : "";
                    result.videoCodec = bestVideo.codecs;
                    result.audioCodec = bestAudio != null ? bestAudio.codecs : "";
                    result.format = "dash";
                    result.loggedIn = hasCookie;
                    result.vipStatus = isVip ? 1 : 0;
                    result.currentQn = actualQn;
                    result.acceptQuality = acceptQuality;
                    result.pages = info.pages;
                    result.currentPage = currentPage;
                    result.videoBackupUrls = videoBackupUrls;
                    result.audioBackupUrls = audioBackupUrls;

                    Log.i(TAG, "[bilibili] 解析完成 (DASH): " + bvid + " qn=" + actualQn +
                        " codec=" + bestVideo.codecs + " videoCandidates=" + videoBackupUrls.size());
                    return result;
                }
            }
        }

        // 9. 兜底：尝试 durl（MP4 单流）
        JSONArray durl = playData.optJSONArray("durl");
        if (durl != null && durl.length() > 0) {
            JSONObject first = durl.getJSONObject(0);
            String url = first.optString("url", "");
            if (!url.isEmpty()) {
                ResolveResult result = new ResolveResult();
                result.title = info.title;
                result.duration = getCurrentPageDuration(info, effectiveCid);
                result.cid = effectiveCid;
                result.videoUrl = url;
                result.format = "mp4";
                result.loggedIn = hasCookie;
                result.vipStatus = isVip ? 1 : 0;
                result.currentQn = actualQn;
                result.acceptQuality = narrowAcceptQualityForMp4(acceptQuality);
                result.pages = info.pages;
                result.currentPage = currentPage;
                result.videoBackupUrls = new ArrayList<>();
                result.audioBackupUrls = new ArrayList<>();
                Log.i(TAG, "[bilibili] 解析完成 (durl 兜底): " + bvid + " qn=" + actualQn);
                return result;
            }
        }

        throw new ResolveException("无法获取可用播放地址", "NO_PLAYABLE_URL");
    }

    /**
     * 校验 Cookie 是否有效，返回用户信息。
     */
    public static JSONObject validateCookie(String cookie) {
        JSONObject result = new JSONObject();
        try {
            if (cookie == null || cookie.isEmpty()) {
                result.put("valid", false);
                return result;
            }
            JSONObject data = bilibiliFetch("https://api.bilibili.com/x/web-interface/nav", cookie);
            if (data == null || !data.optBoolean("isLogin", false)) {
                result.put("valid", false);
                return result;
            }
            result.put("valid", true);
            result.put("userName", data.optString("uname", ""));
            result.put("userMid", data.optLong("mid", 0));
            result.put("vipStatus", data.optInt("vipStatus", 0));
            return result;
        } catch (Exception e) {
            try {
                result.put("valid", false);
                result.put("message", e.getMessage());
            } catch (Exception ignored) {}
            return result;
        }
    }
}
