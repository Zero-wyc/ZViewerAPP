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
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Iterator;
import java.util.Map;
import java.util.TreeMap;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

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
        String setCookie = conn.getHeaderField("Set-Cookie");
        if (setCookie == null) return null;
        // 提取所有 cookie，取第一个分号前作为完整 cookie 串
        StringBuilder sb = new StringBuilder();
        String[] parts = setCookie.split(";");
        for (String part : parts) {
            String trimmed = part.trim();
            if (trimmed.contains("=") && !trimmed.startsWith("Path") && !trimmed.startsWith("Domain")
                && !trimmed.startsWith("Expires") && !trimmed.startsWith("Max-Age")
                && !trimmed.startsWith("HttpOnly") && !trimmed.startsWith("Secure")
                && !trimmed.startsWith("SameSite")) {
                if (sb.length() > 0) sb.append("; ");
                sb.append(trimmed);
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

    private void handleProxyClient(java.net.Socket client) {
        try {
            client.setSoTimeout(30000);
            java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
            // 读取请求行：GET /proxy?url=... HTTP/1.1
            String requestLine = reader.readLine();
            if (requestLine == null) { client.close(); return; }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) { client.close(); return; }
            String path = parts[1];

            // 解析 url 参数
            String targetUrl = null;
            if (path.contains("url=")) {
                String query = path.substring(path.indexOf("url=") + 4);
                if (query.contains("&")) query = query.substring(0, query.indexOf("&"));
                targetUrl = java.net.URLDecoder.decode(query, "UTF-8");
            }

            // 读取 Range 头
            String range = null;
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                if (line.toLowerCase().startsWith("range:")) {
                    range = line.substring(6).trim();
                }
            }

            if (targetUrl == null || targetUrl.isEmpty()) {
                writeResponse(client, 400, "text/plain", "Bad Request".getBytes());
                return;
            }

            String cookie = getPrefs().getString(KEY_COOKIE, "");
            HttpURLConnection conn = openConnection(targetUrl, "GET", cookie);
            if (range != null) {
                conn.setRequestProperty("Range", range);
            }
            int code = conn.getResponseCode();
            byte[] body;
            if (code >= 400) {
                body = readAllBytes(conn.getErrorStream());
            } else {
                body = readAllBytes(conn.getInputStream());
            }

            java.io.OutputStream out = client.getOutputStream();
            String statusLine = "HTTP/1.1 " + code + " " + getStatusText(code) + "\r\n";
            out.write(statusLine.getBytes());
            out.write(("Content-Type: " + conn.getContentType() + "\r\n").getBytes());
            out.write(("Content-Length: " + body.length + "\r\n").getBytes());
            out.write(("Access-Control-Allow-Origin: *\r\n").getBytes());
            if (range != null) {
                String cr = conn.getHeaderField("Content-Range");
                if (cr != null) out.write(("Content-Range: " + cr + "\r\n").getBytes());
            }
            out.write("\r\n".getBytes());
            out.write(body);
            out.flush();
            out.close();
            client.close();
        } catch (Exception ignored) {
            try { client.close(); } catch (Exception ignored2) {}
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
            default: return "Unknown";
        }
    }

    private byte[] readAllBytes(java.io.InputStream in) throws Exception {
        if (in == null) return new byte[0];
        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
        byte[] tmp = new byte[8192];
        int n;
        while ((n = in.read(tmp)) != -1) buf.write(tmp, 0, n);
        return buf.toByteArray();
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