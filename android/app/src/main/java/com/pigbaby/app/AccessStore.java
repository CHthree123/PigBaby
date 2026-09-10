package com.pigbaby.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * 无障碍读取到的页面文本（仅微信/支付宝的账单与支付相关页面）。
 * 先原样保存供校准与调试，提取规则确定后再转为记账候选。
 */
public class AccessStore {

    private static final String PREFS = "pigbaby_access";
    private static final String KEY_ITEMS = "screens";
    private static final String KEY_SEEN = "seen_hashes";
    private static final int MAX_ITEMS = 50;
    private static final int MAX_SEEN = 200;
    private static final long MAX_AGE_MS = 3L * 24 * 60 * 60 * 1000;

    private static long seq = 0;

    public static synchronized boolean add(Context context, String pkg, String app, String text) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String hash = Integer.toHexString(text.hashCode()) + "-" + pkg;
        Set<String> seen = new HashSet<>(prefs.getStringSet(KEY_SEEN, new HashSet<String>()));
        if (seen.contains(hash)) return false;
        seen.add(hash);
        while (seen.size() > MAX_SEEN) {
            seen.remove(seen.iterator().next());
        }
        prefs.edit().putStringSet(KEY_SEEN, seen).commit();

        JSONArray arr = read(prefs);
        long when = System.currentTimeMillis();
        try {
            JSONObject o = new JSONObject();
            o.put("id", when + "-" + (seq++));
            o.put("pkg", pkg);
            o.put("app", app);
            o.put("text", text);
            o.put("when", when);
            arr.put(o);
        } catch (JSONException ignored) {
        }

        long cutoff = System.currentTimeMillis() - MAX_AGE_MS;
        JSONArray kept = new JSONArray();
        int start = Math.max(0, arr.length() - MAX_ITEMS);
        for (int i = start; i < arr.length(); i++) {
            try {
                JSONObject o = arr.getJSONObject(i);
                if (o.optLong("when") >= cutoff) kept.put(o);
            } catch (JSONException ignored) {
            }
        }
        prefs.edit().putString(KEY_ITEMS, kept.toString()).commit();
        return true;
    }

    public static synchronized JSArray peek(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr = read(prefs);
        JSArray out = new JSArray();
        try {
            for (int i = 0; i < arr.length(); i++) {
                out.put(arr.getJSONObject(i));
            }
        } catch (JSONException ignored) {
        }
        return out;
    }

    public static synchronized void clear(Context context, JSArray ids) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr = read(prefs);
        Set<String> drop = new HashSet<>();
        if (ids != null) {
            for (int i = 0; i < ids.length(); i++) {
                try {
                    drop.add(ids.getString(i));
                } catch (JSONException ignored) {
                }
            }
        }
        JSONArray kept = new JSONArray();
        for (int i = 0; i < arr.length(); i++) {
            try {
                JSONObject o = arr.getJSONObject(i);
                if (!drop.contains(o.optString("id"))) kept.put(o);
            } catch (JSONException ignored) {
            }
        }
        prefs.edit().putString(KEY_ITEMS, kept.toString()).commit();
    }

    private static JSONArray read(SharedPreferences prefs) {
        try {
            return new JSONArray(prefs.getString(KEY_ITEMS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
