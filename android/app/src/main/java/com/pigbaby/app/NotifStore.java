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
 * Persists raw WeChat/Alipay notifications captured by the listener service,
 * including while the app is closed. JS pulls, parses and acknowledges them —
 * parsing rules live in the web layer so they can be tuned without a native
 * rebuild of the logic itself.
 */
public class NotifStore {

    private static final String PREFS = "pigbaby_notif";
    private static final String KEY_ITEMS = "captures";
    private static final int MAX_ITEMS = 300;
    private static final long MAX_AGE_MS = 7L * 24 * 60 * 60 * 1000;

    private static long seq = 0;

    private static final String[] TEXT_FIELDS = {
            "pkg", "app", "title", "text", "bigText", "subText",
            "summaryText", "infoText", "titleBig", "conversationTitle",
            "ticker", "extraText", "rawDump"
    };

    public static synchronized void add(Context context, JSObject data) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr = read(prefs);
        long when = data.optLong("when", System.currentTimeMillis());
        try {
            JSONObject o = new JSONObject();
            o.put("id", when + "-" + (seq++));
            for (String key : TEXT_FIELDS) {
                o.put(key, data.optString(key, ""));
            }
            o.put("when", when);
            arr.put(o);
        } catch (JSONException ignored) {
        }

        // 只保留最近 MAX_ITEMS 条且 7 天内的记录
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
        prefs.edit().putString(KEY_ITEMS, kept.toString()).apply();
    }

    /** 取出全部捕获（不清除，由 JS 处理完再按 id 确认清除） */
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
        prefs.edit().putString(KEY_ITEMS, kept.toString()).apply();
    }

    private static JSONArray read(SharedPreferences prefs) {
        try {
            return new JSONArray(prefs.getString(KEY_ITEMS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
