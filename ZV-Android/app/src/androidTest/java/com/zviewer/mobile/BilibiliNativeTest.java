package com.zviewer.mobile;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileInputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import mobile.Mobile;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class BilibiliNativeTest {
    @Test public void loopbackLifecycleDoesNotExposeCookie() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.zviewer.mobile.debug", context.getPackageName());
        JSONObject status = new JSONObject(Mobile.start(""));
        assertTrue(status.getBoolean("ready"));
        assertFalse(status.has("cookie"));
        assertTrue(status.getString("proxyUrl").startsWith("http://127.0.0.1:"));
        String oldAddress = status.getString("proxyUrl");
        Mobile.stop();
        assertFalse(new JSONObject(Mobile.status()).getBoolean("ready"));
        assertNotEquals(oldAddress, new JSONObject(Mobile.start("")).getString("proxyUrl"));
    }

    @Test public void keystoreCookieRoundTripUsesEncryptedNoBackupStorage() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File account = new File(context.getNoBackupFilesDir(), "bilibili-account.enc");
        // Run only on an unused debug test installation, never overwrite an account.
        assertFalse("Use a fresh debug installation for this test", account.exists());
        String fixture = "SESSDATA=synthetic-keystore-fixture";
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            activity.onActivity(host -> {
                try {
                    BilibiliProxyPlugin plugin = (BilibiliProxyPlugin) host.getBridge().getPlugin("BilibiliProxy").getInstance();
                    Method save = BilibiliProxyPlugin.class.getDeclaredMethod("saveCookie", String.class);
                    Method load = BilibiliProxyPlugin.class.getDeclaredMethod("loadCookie");
                    save.setAccessible(true); load.setAccessible(true);
                    save.invoke(plugin, fixture);
                    assertEquals(fixture, load.invoke(plugin));
                    try (FileInputStream input = new FileInputStream(account)) {
                        String stored = new String(input.readAllBytes(), StandardCharsets.UTF_8);
                        assertFalse(stored.contains("SESSDATA"));
                        JSONObject ciphertext = new JSONObject(stored);
                        assertTrue(ciphertext.has("iv")); assertTrue(ciphertext.has("data"));
                    }
                } catch (Exception error) { throw new AssertionError(error); }
            });
        } finally { assertTrue(!account.exists() || account.delete()); }
    }
}
