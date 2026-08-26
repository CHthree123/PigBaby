package com.pigbaby.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.HashSet;
import java.util.Set;

/**
 * Persists parsed payment records between native and web layers.
 * The broadcast receiver writes here while the app is closed; the plugin
 * hands the queue to JS on the next launch. A seen-set dedups re-deliveries.
 */
public class SmsStore {

    private static final String PREFS = "pigbaby_sms";
    private static final String KEY_PENDING = "pending_records";
    private static final String KEY_SEEN = "seen_sigs";
    private static final int MAX_PENDING = 200;
    private static final int MAX_SEEN = 100;

    private static final String[] SEARCH_KEYWORDS = {
            "微信支付", "支付宝", "财付通", "云闪付", "银行", "招商", "建设", "工商",
            "农业", "中国银行", "交通银行", "邮储", "中信", "浦发", "民生", "光大",
            "平安", "兴业", "广发", "微众", "京东金融"
    };

    public static void addPending(Context context, JSObject record) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String sig = record.getString("time") + ":" + record.getString("raw", "");
        Set<String> seen = new HashSet<>(prefs.getStringSet(KEY_SEEN, new HashSet<>()));
        if (seen.contains(sig)) return;
        seen.add(sig);
        while (seen.size() > MAX_SEEN) {
            seen.remove(seen.iterator().next());
        }
        prefs.edit().putStringSet(KEY_SEEN, seen).apply();

        JSONArray arr = readPending(prefs);
        arr.put(record);
        if (arr.length() > MAX_PENDING) {
            JSONArray kept = new JSONArray();
            for (int i = arr.length() - MAX_PENDING; i < arr.length(); i++) {
                try {
                    kept.put(arr.get(i));
                } catch (JSONException ignored) {
                }
            }
            arr = kept;
        }
        prefs.edit().putString(KEY_PENDING, arr.toString()).apply();
    }

    public static JSArray takePending(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr = readPending(prefs);
        prefs.edit().remove(KEY_PENDING).apply();
        JSArray out = new JSArray();
        try {
            for (int i = 0; i < arr.length(); i++) {
                out.put(arr.getJSONObject(i));
            }
        } catch (JSONException ignored) {
        }
        return out;
    }

    private static JSONArray readPending(SharedPreferences prefs) {
        try {
            return new JSONArray(prefs.getString(KEY_PENDING, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** One-shot import: parse the most recent payment SMS from the inbox */
    public static JSArray queryRecent(Context context, int limit) {
        JSArray out = new JSArray();
        try {
            ContentResolver cr = context.getContentResolver();
            Uri uri = Telephony.Sms.Inbox.CONTENT_URI.buildUpon()
                    .appendQueryParameter("limit", String.valueOf(Math.max(1, Math.min(limit, 100))))
                    .build();
            String[] projection = {Telephony.Sms.BODY, Telephony.Sms.DATE};
            StringBuilder sel = new StringBuilder(Telephony.Sms.BODY + " LIKE ?");
            for (int i = 1; i < SEARCH_KEYWORDS.length; i++) {
                sel.append(" OR ").append(Telephony.Sms.BODY).append(" LIKE ?");
            }
            String[] args = new String[SEARCH_KEYWORDS.length];
            for (int i = 0; i < SEARCH_KEYWORDS.length; i++) {
                args[i] = "%" + SEARCH_KEYWORDS[i] + "%";
            }
            Cursor cursor = cr.query(uri, projection, sel.toString(), args, Telephony.Sms.DATE + " DESC");
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String body = cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms.BODY));
                    long time = cursor.getLong(cursor.getColumnIndexOrThrow(Telephony.Sms.DATE));
                    JSObject parsed = SmsParser.parse(body, time);
                    if (parsed != null) {
                        out.put(parsed);
                    }
                }
                cursor.close();
            }
        } catch (Exception ignored) {
            // missing permission or provider issue: return whatever we got
        }
        return out;
    }
}
