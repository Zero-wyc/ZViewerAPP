package com.zviewer.app.plugins;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * ZViewer 原生插件：实现 B站 独立登录、Cookie 持久化、视频解析。
 *
 * 功能：
 * - initQr：生成 B站 扫码登录二维码
 * - pollQr：轮询扫码登录状态，成功后获取 Cookie
 * - validateCookie：校验 Cookie 是否有效
 * - getSavedCookie：获取持久化的 Cookie
 * - clearCookie：清除 Cookie
 * - resolveVideo：解析 B站 视频播放地址（WBI 签名）
 */
@CapacitorPlugin(name = "ZViewer")
public class ZViewerPlugin extends Plugin {

    private static final String PREFS_NAME = "zviewer_bilibili";
    private static final String KEY_COOKIE = "cookie";
    private static final String KEY_USER_NAME = "user_name";
    private static final String KEY_USER_MID = "user_mid";

    private static final String USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    // 桌面版 User-Agent：视频流代理时使用，与 ZViewerCLI userAgent 对齐。
    // B站 CDN 可能根据 User-Agent 返回不同质量的视频流，桌面版更可靠。
    private static final String DESKTOP_USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    // ==================== HTTP 工具 ====================

    private static HttpURLConnection openConnection(String urlStr, String method, String cookie) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setRequestProperty("User-Agent", USER_AGENT);
        conn.setRequestProperty("Referer", "https://www.bilibili.com/");
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        if (cookie != null && !cookie.isEmpty()) {
            conn.setRequestProperty("Cookie", cookie);
        }
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);
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

    private static String readErrorBody(HttpURLConnection conn) throws Exception {
        BufferedReader reader = new BufferedReader(
            new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line);
        }
        reader.close();
        return sb.toString();
    }

    // ==================== Cookie 持久化 ====================

    @PluginMethod
    public void getSavedCookie(PluginCall call) {
        SharedPreferences prefs = getPrefs();
        JSObject result = new JSObject();
        result.put("cookie", prefs.getString(KEY_COOKIE, ""));
        result.put("userName", prefs.getString(KEY_USER_NAME, ""));
        result.put("userMid", prefs.getLong(KEY_USER_MID, 0));
        call.resolve(result);
    }

    @PluginMethod
    public void clearCookie(PluginCall call) {
        getPrefs().edit().clear().apply();
        call.resolve();
    }

    // ==================== QR 登录 ====================

    /**
     * 生成 B站 扫码登录二维码。
     * 返回 qrcodeKey（用于轮询）和二维码 URL。
     */
    @PluginMethod
    public void initQr(PluginCall call) {
        try {
            String body = httpGet("https://passport.bilibili.com/x/passport-login/web/qrcode/generate", null);
            JSONObject json = new JSONObject(body);
            JSONObject data = json.getJSONObject("data");
            String qrcodeKey = data.getString("qrcode_key");
            String qrUrl = data.getString("url");
            JSObject result = new JSObject();
            result.put("qrcodeKey", qrcodeKey);
            result.put("qrUrl", qrUrl);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("生成二维码失败: " + e.getMessage());
        }
    }

    /**
     * 轮询扫码登录状态。
     * 返回 status: 0=pending, 1=scanned, 2=confirmed, 3=expired
     * 扫码成功后返回 cookie。
     */
    @PluginMethod
    public void pollQr(PluginCall call) {
        String qrcodeKey = call.getString("qrcodeKey");
        if (qrcodeKey == null) {
            call.reject("缺少 qrcodeKey");
            return;
        }
        try {
            String url = "https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=" +
                URLEncoder.encode(qrcodeKey, "UTF-8");
            HttpURLConnection conn = openConnection(url, "GET", null);
            // 获取 Set-Cookie（扫码成功后服务端下发 session cookie）
            int statusCode = conn.getResponseCode();
            String body = readBody(conn);
            JSONObject json = new JSONObject(body);
            JSONObject data = json.optJSONObject("data");
            if (data == null) {
                call.reject("二维码数据解析失败");
                return;
            }
            int code = data.optInt("code", -1);
            String qrStatus = data.optString("message", "");
            String cookie = extractCookieFromConnection(conn);

            JSObject result = new JSObject();
            result.put("status", code);
            result.put("message", qrStatus);
            result.put("cookie", cookie != null ? cookie : "");

            // 扫码成功后保存 cookie
            if (code == 0 && cookie != null && !cookie.isEmpty()) {
                saveCookie(cookie);
                // 校验并获取用户信息
                validateAndSaveUser(cookie);
                result.put("cookieValid", true);
            } else {
                result.put("cookieValid", false);
            }
            call.resolve(result);
        } catch (Exception e) {
            call.reject("轮询二维码失败: " + e.getMessage());
        }
    }

    private String extractCookieFromConnection(HttpURLConnection conn) {
        // B站 扫码登录返回多个 Set-Cookie 头，getHeaderField("Set-Cookie") 只返回第一个，
        // 需要 getHeaderFields() 获取全部。
        Map<String, List<String>> headers = conn.getHeaderFields();
        List<String> setCookies = headers.get("Set-Cookie");
        if (setCookies == null || setCookies.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (String raw : setCookies) {
            // 每个 Set-Cookie 取第一个分号前（name=value 部分）
            String nameValue = raw.split(";")[0].trim();
            if (nameValue.contains("=")) {
                if (sb.length() > 0) sb.append("; ");
                sb.append(nameValue);
            }
        }
        return sb.length() > 0 ? sb.toString() : null;
    }

    private void saveCookie(String cookie) {
        getPrefs().edit().putString(KEY_COOKIE, cookie).apply();
    }

    private void validateAndSaveUser(String cookie) {
        try {
            String body = httpGet("https://api.bilibili.com/x/web-interface/nav", cookie);
            JSONObject json = new JSONObject(body);
            JSONObject data = json.optJSONObject("data");
            if (data != null && data.optBoolean("isLogin", false)) {
                String uname = data.optString("uname", "");
                long mid = data.optLong("mid", 0);
                getPrefs().edit()
                    .putString(KEY_USER_NAME, uname)
                    .putLong(KEY_USER_MID, mid)
                    .apply();
            }
        } catch (Exception ignored) {
        }
    }

    // ==================== Cookie 校验 ====================

    @PluginMethod
    public void validateCookie(PluginCall call) {
        String cookie = call.getString("cookie");
        if (cookie == null || cookie.isEmpty()) {
            cookie = getPrefs().getString(KEY_COOKIE, "");
        }
        if (cookie.isEmpty()) {
            call.resolve(new JSObject().put("valid", false).put("message", "无 Cookie"));
            return;
        }
        try {
            String body = httpGet("https://api.bilibili.com/x/web-interface/nav", cookie);
            JSONObject json = new JSONObject(body);
            JSONObject data = json.optJSONObject("data");
            boolean valid = data != null && data.optBoolean("isLogin", false);
            JSObject result = new JSObject();
            result.put("valid", valid);
            if (valid) {
                result.put("userName", data.optString("uname", ""));
                result.put("userMid", data.optLong("mid", 0));
                // 更新持久化
                getPrefs().edit()
                    .putString(KEY_COOKIE, cookie)
                    .putString(KEY_USER_NAME, data.optString("uname", ""))
                    .putLong(KEY_USER_MID, data.optLong("mid", 0))
                    .apply();
            } else {
                result.put("message", "Cookie 无效或已过期");
            }
            call.resolve(result);
        } catch (Exception e) {
            call.reject("校验 Cookie 失败: " + e.getMessage());
        }
    }

    // ==================== 视频解析 ====================

    /**
     * 解析 B站 视频播放地址。
     * 支持 bvid 或 avid。
     * 返回包含视频流 url、画质列表、弹幕参数等。
     */
    @PluginMethod
    public void resolveVideo(PluginCall call) {
        String bvid = call.getString("bvid");
        String cookie = call.getString("cookie");
        if (cookie == null || cookie.isEmpty()) {
            cookie = getPrefs().getString(KEY_COOKIE, "");
        }
        if (bvid == null || bvid.isEmpty()) {
            call.reject("缺少 bvid");
            return;
        }
        try {
            // 1. 获取视频基本信息（view API）
            String viewUrl = "https://api.bilibili.com/x/web-interface/view?bvid=" + URLEncoder.encode(bvid, "UTF-8");
            String viewBody = httpGet(viewUrl, cookie);
            JSONObject viewJson = new JSONObject(viewBody);
            if (viewJson.optInt("code", -1) != 0) {
                call.reject("获取视频信息失败: " + viewJson.optString("message", ""));
                return;
            }
            JSONObject viewData = viewJson.getJSONObject("data");
            long cid = viewData.optLong("cid", 0);
            long avid = viewData.optLong("aid", 0);
            String title = viewData.optString("title", "");
            long duration = viewData.optLong("duration", 0);

            // 2. 获取播放地址（playurl API，含 DASH）
            String playUrl = "https://api.bilibili.com/x/player/playurl?bvid=" + URLEncoder.encode(bvid, "UTF-8") +
                "&cid=" + cid + "&fnval=16&fourk=1";
            String playBody = httpGet(playUrl, cookie);
            JSONObject playJson = new JSONObject(playBody);
            if (playJson.optInt("code", -1) != 0) {
                call.reject("获取播放地址失败: " + playJson.optString("message", ""));
                return;
            }
            JSONObject playData = playJson.getJSONObject("data");

            // 3. 组装结果
            JSObject result = new JSObject();
            result.put("bvid", bvid);
            result.put("avid", avid);
            result.put("cid", cid);
            result.put("title", title);
            result.put("duration", duration);

            // DASH 流
            JSONObject dash = playData.optJSONObject("dash");
            if (dash != null) {
                result.put("hasDash", true);
                JSONArray videoArr = dash.optJSONArray("video");
                JSObject videoInfo = new JSObject();
                if (videoArr != null && videoArr.length() > 0) {
                    JSONObject first = videoArr.getJSONObject(0);
                    videoInfo.put("baseUrl", first.optString("baseUrl", ""));
                    videoInfo.put("baseUrlBackup", first.optString("baseUrlBackup", ""));
                }
                JSONArray audioArr = dash.optJSONArray("audio");
                JSObject audioInfo = new JSObject();
                if (audioArr != null && audioArr.length() > 0) {
                    JSONObject first = audioArr.getJSONObject(0);
                    audioInfo.put("baseUrl", first.optString("baseUrl", ""));
                }
                result.put("videoStream", videoInfo);
                result.put("audioStream", audioInfo);
                // MPD 生成（DASH manifest 构造）
                String mpd = generateMpdXml(dash, duration);
                if (mpd != null) {
                    result.put("mpd", mpd);
                }
            } else {
                // 非 DASH，直接取 durl
                JSONArray durl = playData.optJSONArray("durl");
                if (durl != null && durl.length() > 0) {
                    JSONObject first = durl.getJSONObject(0);
                    result.put("hasDash", false);
                    result.put("durl", first.optString("url", ""));
                }
            }

            // 画质列表
            JSONArray acceptQuality = playData.optJSONArray("accept_quality");
            JSONArray acceptDescription = playData.optJSONArray("accept_description");
            JSONArray qualities = new JSONArray();
            if (acceptQuality != null && acceptDescription != null) {
                for (int i = 0; i < acceptQuality.length() && i < acceptDescription.length(); i++) {
                    JSONObject q = new JSONObject();
                    q.put("id", acceptQuality.getInt(i));
                    q.put("label", acceptDescription.getString(i));
                    qualities.put(q);
                }
            }
            result.put("qualities", qualities);
            result.put("currentQn", playData.optInt("quality", 0));

            call.resolve(result);
        } catch (Exception e) {
            call.reject("解析视频失败: " + e.getMessage());
        }
    }

    // ==================== MPD 生成 ====================

    /**
     * 从 B站 DASH 数据生成 MPD XML（DASH manifest）。
     * 供 dash.js 播放器识别视频/音频流。
     */
    private String generateMpdXml(JSONObject dash, long durationSec) {
        try {
            String uuid = java.util.UUID.randomUUID().toString();
            StringBuilder sb = new StringBuilder();
            sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            sb.append("<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\" ")
              .append("mediaPresentationDuration=\"PT").append(Math.max(1, durationSec)).append("S\" ")
              .append("minBufferTime=\"PT1.5S\" profiles=\"urn:mpeg:dash:profile:isoff-on-demand:2011\">\n");
            sb.append("  <Period>\n");

            // 视频流
            JSONArray videos = dash.optJSONArray("video");
            if (videos != null && videos.length() > 0) {
                JSONObject v = videos.getJSONObject(0);
                String mime = v.optString("mimeType", "video/mp4");
                String codecs = v.optString("codecs", "avc1.64001f");
                long bandwidth = v.optLong("bandwidth", 1000000);
                int width = v.optInt("width", 1920);
                int height = v.optInt("height", 1080);
                String baseUrl = v.optString("baseUrl", "");
                sb.append("    <AdaptationSet mimeType=\"").append(mime).append("\" ")
                  .append("codecs=\"").append(codecs).append("\" ")
                  .append("startWithSAP=\"1\" segmentAlignment=\"true\"")
                  .append(">\n");
                sb.append("      <Representation id=\"video\" mimeType=\"").append(mime).append("\" ")
                  .append("codecs=\"").append(codecs).append("\" ")
                  .append("bandwidth=\"").append(bandwidth).append("\" ")
                  .append("width=\"").append(width).append("\" height=\"").append(height).append("\">\n");
                sb.append("        <BaseURL>").append(escapeXml(baseUrl)).append("</BaseURL>\n");
                sb.append("        <SegmentBase indexRange=\"").append(extractIndexRange(v)).append("\">\n");
                sb.append("          <Initialization range=\"").append(extractInitRange(v)).append("\" />\n");
                sb.append("        </SegmentBase>\n");
                sb.append("      </Representation>\n");
                sb.append("    </AdaptationSet>\n");
            }

            // 音频流
            JSONArray audios = dash.optJSONArray("audio");
            if (audios != null && audios.length() > 0) {
                JSONObject a = audios.getJSONObject(0);
                String mime = a.optString("mimeType", "audio/mp4");
                String codecs = a.optString("codecs", "mp4a.40.2");
                long bandwidth = a.optLong("bandwidth", 128000);
                String baseUrl = a.optString("baseUrl", "");
                sb.append("    <AdaptationSet mimeType=\"").append(mime).append("\" ")
                  .append("codecs=\"").append(codecs).append("\" ")
                  .append("startWithSAP=\"1\" segmentAlignment=\"true\"")
                  .append(">\n");
                sb.append("      <Representation id=\"audio\" mimeType=\"").append(mime).append("\" ")
                  .append("codecs=\"").append(codecs).append("\" ")
                  .append("bandwidth=\"").append(bandwidth).append("\">\n");
                sb.append("        <BaseURL>").append(escapeXml(baseUrl)).append("</BaseURL>\n");
                sb.append("        <SegmentBase indexRange=\"").append(extractIndexRange(a)).append("\">\n");
                sb.append("          <Initialization range=\"").append(extractInitRange(a)).append("\" />\n");
                sb.append("        </SegmentBase>\n");
                sb.append("      </Representation>\n");
                sb.append("    </AdaptationSet>\n");
            }

            sb.append("  </Period>\n");
            sb.append("</MPD>\n");
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** 从 SegmentBase 中提取 Initialization range */
    private String extractInitRange(JSONObject stream) {
        JSONObject sb = stream.optJSONObject("SegmentBase");
        if (sb != null) {
            JSONObject init = sb.optJSONObject("Initialization");
            if (init != null) {
                String range = init.optString("range", "0-1000");
                return range;
            }
        }
        return "0-1000";
    }

    /** 从 SegmentBase 中提取 indexRange */
    private String extractIndexRange(JSONObject stream) {
        JSONObject sb = stream.optJSONObject("SegmentBase");
        if (sb != null) {
            String range = sb.optString("indexRange", "0-1000");
            return range;
        }
        return "0-1000";
    }

    /** XML 转义 */
    private String escapeXml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&apos;");
    }

    // ==================== 本地代理（Android ServerSocket） ====================

    private java.net.ServerSocket proxyServerSocket;
    private Thread proxyThread;
    private int proxyPort = 0;
    private volatile boolean proxyRunning = false;

    // 备份 URL 缓存：主 CDN URL → 候选 URL 列表（含 backup），供 /proxy 失败时重试。
    private final java.util.Map<String, java.util.List<String>> backupUrlCache = new java.util.concurrent.ConcurrentHashMap<>();

    /** 缓存主 URL 与候选 URL 映射（与 ZViewerCLI Agent.setBackupUrls 对齐） */
    private void backupUrlCachePut(String primaryUrl, java.util.List<String> candidates) {
        if (primaryUrl == null || primaryUrl.isEmpty() || candidates == null || candidates.isEmpty()) {
            return;
        }
        backupUrlCache.put(primaryUrl, new ArrayList<>(candidates));
    }

    /** 获取主 URL 的候选 URL 列表（不含主 URL 自身） */
    private java.util.List<String> backupUrlCacheGet(String primaryUrl) {
        java.util.List<String> candidates = backupUrlCache.get(primaryUrl);
        if (candidates == null) return new ArrayList<>();
        java.util.List<String> result = new ArrayList<>();
        for (String u : candidates) {
            if (u != null && !u.equals(primaryUrl)) {
                result.add(u);
            }
        }
        return result;
    }

    /**
     * 启动本地 HTTP 代理服务器（Android 端本地代理）。
     * 前端将 B站 流地址重写为 http://127.0.0.1:<port>/proxy?url=...，
     * 由本服务器带上 B站 需要的 Referer/User-Agent/Cookie 头后转发。
     * 支持 Range 请求（断点续传，用于 DASH 视频播放）。
     *
     * 返回 { port, baseUrl }。
     */
    @PluginMethod
    public void startProxy(PluginCall call) {
        try {
            if (proxyRunning) {
                JSObject ok = new JSObject();
                ok.put("port", proxyPort);
                ok.put("baseUrl", "http://127.0.0.1:" + proxyPort + "/proxy?url=");
                call.resolve(ok);
                return;
            }
            proxyServerSocket = new java.net.ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"));
            proxyPort = proxyServerSocket.getLocalPort();
            proxyRunning = true;
            proxyThread = new Thread(() -> {
                while (proxyRunning && !proxyServerSocket.isClosed()) {
                    try {
                        java.net.Socket client = proxyServerSocket.accept();
                        new Thread(() -> handleProxyClient(client)).start();
                    } catch (Exception ignored) {
                    }
                }
            });
            proxyThread.setDaemon(true);
            proxyThread.start();
            JSObject result = new JSObject();
            result.put("port", proxyPort);
            result.put("baseUrl", "http://127.0.0.1:" + proxyPort + "/proxy?url=");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("启动代理失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopProxy(PluginCall call) {
        proxyRunning = false;
        try { if (proxyServerSocket != null) proxyServerSocket.close(); } catch (Exception ignored) {}
        call.resolve();
    }

    private void handleResolveRequest(java.net.Socket client, String queryString) {
        try {
            // 解析参数（与 ZViewerCLI /resolve 对齐：bvid / cid / qn / preferMp4 / forceDash）
            String bvid = "";
            long cid = 0;
            int qn = 0;
            boolean preferMp4 = false;
            boolean forceDash = false;
            for (String param : queryString.split("&")) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2) {
                    String val = java.net.URLDecoder.decode(kv[1], "UTF-8");
                    switch (kv[0]) {
                        case "bvid": bvid = val; break;
                        case "cid":
                            try { cid = Long.parseLong(val); } catch (NumberFormatException ignored) {}
                            break;
                        case "qn":
                            try { qn = Integer.parseInt(val); } catch (NumberFormatException ignored) {}
                            break;
                        case "preferMp4": preferMp4 = "true".equals(val) || "1".equals(val); break;
                        case "forceDash": forceDash = "true".equals(val) || "1".equals(val); break;
                    }
                }
            }
            if (bvid.isEmpty()) {
                writeResponse(client, 400, "application/json",
                    "{\"success\":false,\"message\":\"缺少 bvid\"}".getBytes());
                return;
            }

            String cookie = getPrefs().getString(KEY_COOKIE, "");
            if (cookie.isEmpty()) {
                writeResponse(client, 400, "application/json",
                    "{\"success\":false,\"message\":\"请先登录 B站 账号\"}".getBytes());
                return;
            }

            // 委托 BilibiliResolver 执行完整解析（WBI 签名 / VIP 校验 / DASH 排序 / 备份 URL 收集）
            BilibiliResolver.ResolveOptions opts = new BilibiliResolver.ResolveOptions();
            opts.bvid = bvid;
            opts.cookie = cookie;
            opts.qn = qn;
            opts.cid = cid;
            opts.preferMp4 = preferMp4;
            opts.forceDash = forceDash;
            opts.skipCdnCheck = true; // CLI 代理模式：本地探测无意义，直接使用 BaseUrl

            BilibiliResolver.ResolveResult result = BilibiliResolver.resolveBilibiliVideo(opts);

            // 缓存主 URL 与候选 URL 映射（视频/音频分开），供 /proxy 失败时重试其他 CDN
            if (result.videoBackupUrls != null && !result.videoBackupUrls.isEmpty()) {
                backupUrlCachePut(result.videoUrl, result.videoBackupUrls);
            }
            if (result.audioUrl != null && !result.audioUrl.isEmpty()
                && result.audioBackupUrls != null && !result.audioBackupUrls.isEmpty()) {
                backupUrlCachePut(result.audioUrl, result.audioBackupUrls);
            }

            // 构建响应（与 ZViewerCLI /resolve 格式兼容）
            // 注意：videoUrl / audioUrl 返回原始 B站 CDN URL，
            // 前端 resolveBilibiliViaCli 会通过 wrapResolvedSourceWithCliProxy 包装为代理 URL。
            // 这与 ZViewerCLI 的行为一致（CLI 端返回代理 URL，但前端会再次包装并去重）。
            JSONObject resp = new JSONObject();
            resp.put("success", true);
            resp.put("title", result.title);
            resp.put("duration", result.duration);
            resp.put("cid", result.cid);
            resp.put("videoUrl", result.videoUrl);
            if (result.audioUrl != null && !result.audioUrl.isEmpty()) {
                resp.put("audioUrl", result.audioUrl);
            }
            if (result.videoCodec != null && !result.videoCodec.isEmpty()) {
                resp.put("videoCodec", result.videoCodec);
            }
            if (result.audioCodec != null && !result.audioCodec.isEmpty()) {
                resp.put("audioCodec", result.audioCodec);
            }
            resp.put("format", result.format);
            resp.put("loggedIn", result.loggedIn);
            resp.put("vipStatus", result.vipStatus);
            resp.put("currentQn", result.currentQn);

            // acceptQuality 数组
            JSONArray qualities = new JSONArray();
            if (result.acceptQuality != null) {
                for (BilibiliResolver.QualityItem q : result.acceptQuality) {
                    qualities.put(q.toJson());
                }
            }
            resp.put("acceptQuality", qualities);

            // pages 数组（分集信息）
            if (result.pages != null && !result.pages.isEmpty()) {
                JSONArray pages = new JSONArray();
                for (BilibiliResolver.VideoPage p : result.pages) {
                    JSONObject pageObj = new JSONObject();
                    pageObj.put("page", p.page);
                    pageObj.put("cid", p.cid);
                    pageObj.put("part", p.part);
                    pageObj.put("duration", p.duration);
                    pages.put(pageObj);
                }
                resp.put("pages", pages);
                resp.put("currentPage", result.currentPage);
            }

            // 同时返回原始 URL 和代理 URL（与 ZViewerCLI 对齐）
            // sourceVideoUrl / sourceAudioUrl 保留原始 CDN URL，供前端在需要时直接使用
            String proxyBase = "http://127.0.0.1:" + proxyPort;
            resp.put("sourceVideoUrl", result.videoUrl);
            resp.put("videoUrl", proxyBase + "/proxy?url=" + URLEncoder.encode(result.videoUrl, "UTF-8"));
            if (result.audioUrl != null && !result.audioUrl.isEmpty()) {
                resp.put("sourceAudioUrl", result.audioUrl);
                resp.put("audioUrl", proxyBase + "/proxy?url=" + URLEncoder.encode(result.audioUrl, "UTF-8"));
            }

            writeResponse(client, 200, "application/json", resp.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            try {
                String errMsg = e.getMessage() != null ? e.getMessage().replace("\"", "'") : "解析失败";
                String code = "";
                if (e instanceof BilibiliResolver.ResolveException) {
                    code = ((BilibiliResolver.ResolveException) e).code;
                }
                JSONObject errResp = new JSONObject();
                errResp.put("success", false);
                errResp.put("message", errMsg);
                if (!code.isEmpty()) errResp.put("code", code);
                writeResponse(client, 500, "application/json", errResp.toString().getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) {}
        }
    }

    private void handleProxyClient(java.net.Socket client) {
        try {
            client.setSoTimeout(60000); // 与 ZViewerCLI proxyUpstreamTimeoutMs 对齐
            java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
            // 读取请求行：GET /proxy?url=... HTTP/1.1
            String requestLine = reader.readLine();
            if (requestLine == null) { client.close(); return; }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) { client.close(); return; }
            String method = parts[0];
            String path = parts[1];
            String queryString = path.contains("?") ? path.substring(path.indexOf("?") + 1) : "";

            // 读取所有请求头
            java.util.Map<String, String> headers = new java.util.HashMap<>();
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                int colon = line.indexOf(':');
                if (colon > 0) {
                    String key = line.substring(0, colon).trim().toLowerCase();
                    String value = line.substring(colon + 1).trim();
                    headers.put(key, value);
                }
            }

            // CORS 预检：OPTIONS 请求直接返回 204 + CORS 头
            if ("OPTIONS".equals(method)) {
                java.io.OutputStream out = client.getOutputStream();
                out.write("HTTP/1.1 204 No Content\r\n".getBytes());
                out.write("Access-Control-Allow-Origin: *\r\n".getBytes());
                out.write("Access-Control-Allow-Methods: GET, OPTIONS\r\n".getBytes());
                out.write("Access-Control-Allow-Headers: Content-Type, Range\r\n".getBytes());
                out.write("Access-Control-Max-Age: 86400\r\n".getBytes());
                out.write("Content-Length: 0\r\n".getBytes());
                out.write("\r\n".getBytes());
                out.flush();
                out.close();
                client.close();
                return;
            }

            // ===== /resolve 端点：模拟 CLI 的视频解析接口 =====
            if (path.startsWith("/resolve")) {
                handleResolveRequest(client, queryString);
                return;
            }

            // ===== /health 端点：健康检查（与 ZViewerCLI /health 对齐） =====
            if (path.startsWith("/health")) {
                JSONObject health = new JSONObject();
                health.put("ok", true);
                health.put("agent", "zviewer-android");
                health.put("version", "android");
                writeResponse(client, 200, "application/json", health.toString().getBytes(StandardCharsets.UTF_8));
                return;
            }

            // ===== /proxy 端点：代理视频流 =====
            // 解析 url 参数
            String targetUrl = null;
            for (String param : queryString.split("&")) {
                String[] kv = param.split("=", 2);
                if (kv.length == 2 && "url".equals(kv[0])) {
                    targetUrl = java.net.URLDecoder.decode(kv[1], "UTF-8");
                    break;
                }
            }

            if (targetUrl == null || targetUrl.isEmpty()) {
                writeResponse(client, 400, "text/plain", "Bad Request".getBytes());
                return;
            }

            String range = headers.get("range");

            // 候选 URL：主 URL + backup URL（与 ZViewerCLI handleProxy 对齐）
            java.util.List<String> candidates = new ArrayList<>();
            candidates.add(targetUrl);
            candidates.addAll(backupUrlCacheGet(targetUrl));

            // 逐个尝试候选 CDN，首个成功即返回
            Exception lastErr = null;
            for (int i = 0; i < candidates.size(); i++) {
                String candidate = candidates.get(i);
                try {
                    if (doProxyRequest(client, candidate, range)) {
                        // 成功已写入响应
                        return;
                    }
                } catch (Exception e) {
                    lastErr = e;
                    // 客户端已断开时不继续尝试
                    if (client.isClosed()) return;
                    // 继续尝试下一个候选
                }
            }

            // 所有候选均失败
            if (!client.isClosed()) {
                String errMsg = lastErr != null ? lastErr.getMessage() : "代理请求失败";
                writeResponse(client, 502, "application/json",
                    ("{\"error\":\"" + errMsg.replace("\"", "'") + "\"}").getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
            try { client.close(); } catch (Exception ignored2) {}
        }
    }

    /**
     * 执行单次上游代理请求，流式转发响应（边读边写，避免大文件 OOM）。
     * 成功时已将响应写入 client 并返回 true；失败返回 false。
     *
     * 注意：不使用 openConnection，因为视频流代理需要更长的超时（60s，与 ZViewerCLI 对齐）、
     * 不需要 Cookie、需要 Origin 头、Accept 应为通配符（而非 JSON）。
     */
    private boolean doProxyRequest(java.net.Socket client, String targetUrl, String range) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(targetUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            // 与 ZViewerCLI doProxyRequest 对齐：注入 B站 防盗链所需的 Referer/Origin/User-Agent
            conn.setRequestProperty("User-Agent", DESKTOP_USER_AGENT);
            conn.setRequestProperty("Accept", "*/*");
            conn.setRequestProperty("Referer", "https://www.bilibili.com");
            conn.setRequestProperty("Origin", "https://www.bilibili.com");
            if (range != null && !range.isEmpty()) {
                conn.setRequestProperty("Range", range);
            }
            // 视频流是大文件传输，需要更长的超时（与 ZViewerCLI proxyUpstreamTimeoutMs 对齐）
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(60000);

            int code = conn.getResponseCode();
            // 上游非 2xx 时透传状态码（与 ZViewerCLI doProxyRequest 对齐）
            java.io.InputStream upstream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (upstream == null) {
                upstream = new java.io.ByteArrayInputStream(new byte[0]);
            }

            java.io.OutputStream out = client.getOutputStream();
            // 状态行
            out.write(("HTTP/1.1 " + code + " " + getStatusText(code) + "\r\n").getBytes());

            // Content-Type：B站 CDN 偶发返回 application/json（实际是视频数据），
            // 使用兜底 video/mp4 避免 MSE 引擎因类型不匹配拒绝处理。
            String contentType = conn.getContentType();
            if (contentType != null && contentType.toLowerCase().contains("application/json")) {
                contentType = "video/mp4";
            } else if (contentType == null || contentType.isEmpty()) {
                contentType = "video/mp4";
            }
            out.write(("Content-Type: " + contentType + "\r\n").getBytes());

            // 透传关键头（与 ZViewerCLI proxyPassThroughHeaders 对齐）
            String[] passThrough = {"Content-Length", "Accept-Ranges", "Content-Range", "ETag", "Last-Modified"};
            for (String header : passThrough) {
                String value = conn.getHeaderField(header);
                if (value != null && !value.isEmpty()) {
                    out.write((header + ": " + value + "\r\n").getBytes());
                }
            }

            // CORS 头
            out.write("Access-Control-Allow-Origin: *\r\n".getBytes());
            out.write("Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length\r\n".getBytes());

            out.write("\r\n".getBytes());

            // 流式转发：边读边写，避免大文件 OOM
            byte[] buffer = new byte[64 * 1024]; // 64KB 缓冲区
            int n;
            while ((n = upstream.read(buffer)) != -1) {
                out.write(buffer, 0, n);
                out.flush();
            }
            out.flush();
            out.close();
            upstream.close();
            return true;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void writeResponse(java.net.Socket client, int code, String contentType, byte[] body) throws Exception {
        java.io.OutputStream out = client.getOutputStream();
        out.write(("HTTP/1.1 " + code + " " + getStatusText(code) + "\r\n").getBytes());
        out.write(("Content-Type: " + contentType + "\r\n").getBytes());
        out.write(("Content-Length: " + body.length + "\r\n").getBytes());
        out.write(("Access-Control-Allow-Origin: *\r\n").getBytes());
        out.write("\r\n".getBytes());
        out.write(body);
        out.flush();
        out.close();
    }

    private String getStatusText(int code) {
        switch (code) {
            case 200: return "OK";
            case 206: return "Partial Content";
            case 302: return "Found";
            case 400: return "Bad Request";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 500: return "Internal Server Error";
            case 502: return "Bad Gateway";
            default: return "Unknown";
        }
    }

    // ==================== 通用 HTTP ====================

    private String httpGet(String urlStr, String cookie) throws Exception {
        HttpURLConnection conn = openConnection(urlStr, "GET", cookie);
        int code = conn.getResponseCode();
        if (code >= 400) {
            return readErrorBody(conn);
        }
        return readBody(conn);
    }
}