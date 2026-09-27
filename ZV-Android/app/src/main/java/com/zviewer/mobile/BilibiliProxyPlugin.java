package com.zviewer.mobile;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.OutputStream;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import mobile.Mobile;
import org.json.JSONObject;

@CapacitorPlugin(name = "BilibiliProxy")
public class BilibiliProxyPlugin extends Plugin {
    private static final String KEY_ALIAS = "zviewer.bilibili.cookie.v1";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private String qrKey = "";
    private String qrImage = "";

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }

    private File cookieFile() { return new File(getContext().getNoBackupFilesDir(), "bilibili-account.enc"); }

    private void saveCookie(String cookie) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(cookie.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        JSONObject stored = new JSONObject();
        stored.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
        stored.put("data", Base64.encodeToString(encrypted, Base64.NO_WRAP));
        File temporary = new File(getContext().getNoBackupFilesDir(), "bilibili-account.tmp");
        try (OutputStream output = new java.io.FileOutputStream(temporary)) {
            output.write(stored.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        if (!temporary.renameTo(cookieFile())) throw new java.io.IOException("无法保存登录状态");
    }

    private String loadCookie() throws Exception {
        if (!cookieFile().exists()) return "";
        byte[] bytes;
        try (java.io.InputStream input = new java.io.FileInputStream(cookieFile());
             java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            bytes = output.toByteArray();
        }
        JSONObject stored = new JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(stored.getString("iv"), Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(stored.getString("data"), Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8);
    }

    private interface Operation { String run() throws Exception; }
    private void run(PluginCall call, Operation operation) {
        worker.execute(() -> {
            try { call.resolve(new JSObject(operation.run())); }
            catch (Exception error) { call.reject(error.getMessage() == null ? "本地代理操作失败" : error.getMessage()); }
        });
    }

    @PluginMethod public void start(PluginCall call) {
        run(call, () -> {
            String cookie = "";
            try { cookie = loadCookie(); } catch (Exception error) { cookieFile().delete(); }
            String status = Mobile.start(cookie);
            // A network validation failure must not erase the saved account.
            return status;
        });
    }
    @PluginMethod public void status(PluginCall call) { run(call, Mobile::status); }
    @PluginMethod public void createQr(PluginCall call) {
        run(call, () -> {
            String data = Mobile.qr(); JSONObject qr = new JSONObject(data);
            qrKey = qr.getString("qrcodeKey"); qrImage = qr.getString("qrDataUrl"); return data;
        });
    }
    @PluginMethod public void cancelQr(PluginCall call) {
        run(call, () -> { qrKey = ""; qrImage = ""; return "{}"; });
    }
    @PluginMethod public void pollQr(PluginCall call) {
        run(call, () -> {
            String requestedKey = call.getString("key", "");
            if (qrKey.isEmpty() || !qrKey.equals(requestedKey)) throw new IllegalStateException("二维码会话已结束");
            JSONObject result = new JSONObject(Mobile.pollQR(qrKey));
            String cookie = result.optString("cookie", "");
            result.remove("cookie");
            if (result.optBoolean("loggedIn") && !cookie.isEmpty()) {
                String status = Mobile.setCookie(cookie);
                try { saveCookie(cookie); } catch (Exception error) { Mobile.logout(); throw error; }
                qrKey = ""; qrImage = "";
                result.put("proxyStatus", new JSONObject(status));
            }
            return result.toString();
        });
    }
    @PluginMethod public void logout(PluginCall call) {
        run(call, () -> { qrKey = ""; qrImage = ""; cookieFile().delete(); return Mobile.logout(); });
    }
    @PluginMethod public void saveQr(PluginCall call) {
        run(call, () -> {
            if (qrImage.isEmpty()) throw new IllegalStateException("请先获取二维码");
            byte[] png = Base64.decode(qrImage.substring(qrImage.indexOf(',') + 1), Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, "ZViewer-Bilibili-Login.png");
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/ZViewer");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new java.io.IOException("无法保存二维码");
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) { if (output == null) throw new java.io.IOException("无法写入相册"); output.write(png); }
                values.clear(); values.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, values, null, null);
            } else {
                File image = new File(getContext().getCacheDir(), "bilibili-login.png");
                try (OutputStream output = new java.io.FileOutputStream(image)) { output.write(png); }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", image);
                Intent share = new Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().runOnUiThread(() -> getActivity().startActivity(Intent.createChooser(share, "保存或分享登录二维码")));
            }
            return "{\"saved\":true}";
        });
    }
    @Override protected void handleOnDestroy() {
        worker.execute(Mobile::stop);
        worker.shutdown();
    }
}
