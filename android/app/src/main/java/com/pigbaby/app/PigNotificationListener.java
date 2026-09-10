package com.pigbaby.app;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import com.getcapacitor.JSObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 自动记账采集层：只读取微信与支付宝两个包的通知，保存所有可见文本，
 * 其余 App 的通知直接忽略（不落盘、不处理）。解析与打标在 JS 层进行，
 * 便于不重新编译原生代码即可校准规则。
 */
public class PigNotificationListener extends NotificationListenerService {

    private static final Set<String> WATCHED = new HashSet<>(Arrays.asList(
            "com.tencent.mm",
            "com.eg.android.AlipayGphone"
    ));

    // 已单独读取的字段，兜底收集时跳过以免重复
    private static final Set<String> HANDLED_KEYS = new HashSet<>(Arrays.asList(
            Notification.EXTRA_TITLE,
            Notification.EXTRA_TEXT,
            Notification.EXTRA_BIG_TEXT,
            Notification.EXTRA_SUB_TEXT,
            Notification.EXTRA_SUMMARY_TEXT,
            Notification.EXTRA_INFO_TEXT,
            Notification.EXTRA_TITLE_BIG,
            Notification.EXTRA_CONVERSATION_TITLE
    ));

    private static final int MAX_PART_LEN = 160;
    private static final int MAX_EXTRA_LEN = 800;

    // 账单类关键词预筛：微信里大量普通聊天通知不含任何上述字样，直接丢弃，
    // 避免队列与调试页被无关消息淹没（宁可多留，不可漏抓）
    private static final String[] FINANCE_HINTS = {
            "¥", "￥", "元", "扣", "到账", "收款", "退款", "转账", "收入", "支出",
            "消费", "账单", "支付", "余额", "红包", "付款"
    };

    private static boolean looksLikeFinance(String title, String text, String big) {
        String all = title + " " + text + " " + big;
        for (String hint : FINANCE_HINTS) {
            if (all.contains(hint)) return true;
        }
        return false;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        if (pkg == null || !WATCHED.contains(pkg)) return;
        Notification n = sbn.getNotification();
        if (n == null) return;
        Bundle extras = n.extras;
        if (extras == null) return;
        // 群组摘要通知不含明细，跳过
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        String title = str(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = str(extras.getCharSequence(Notification.EXTRA_TEXT));
        String big = str(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (title.isEmpty() && text.isEmpty() && big.isEmpty()) return;
        if (!looksLikeFinance(title, text, big)) return;

        JSObject o = new JSObject();
        o.put("pkg", pkg);
        o.put("app", "com.tencent.mm".equals(pkg) ? "微信" : "支付宝");
        o.put("title", title);
        o.put("text", text);
        o.put("bigText", big);
        o.put("subText", str(extras.getCharSequence(Notification.EXTRA_SUB_TEXT)));
        o.put("summaryText", str(extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)));
        o.put("infoText", str(extras.getCharSequence(Notification.EXTRA_INFO_TEXT)));
        o.put("titleBig", str(extras.getCharSequence(Notification.EXTRA_TITLE_BIG)));
        o.put("conversationTitle", str(extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)));
        o.put("extraText", collectExtraText(extras));
        o.put("when", sbn.getPostTime() > 0 ? sbn.getPostTime() : System.currentTimeMillis());

        NotifStore.add(this, o);

        Intent i = new Intent(AutoCapturePlugin.EVENT_CAPTURED);
        i.setPackage(getPackageName());
        sendBroadcast(i);
    }

    /**
     * 兜底：收集 extras 中其他所有文本（多行样式 textLines、厂商/应用自定义模板等），
     * 每段截断 160 字、总计 800 字、段间去重；跳过样式模板类名等噪音。
     */
    private static String collectExtraText(Bundle extras) {
        StringBuilder sb = new StringBuilder();
        for (String key : extras.keySet()) {
            if (HANDLED_KEYS.contains(key) || Notification.EXTRA_TEMPLATE.equals(key)) continue;
            Object v = extras.get(key);
            if (v instanceof CharSequence) {
                appendPart(sb, v.toString());
            } else if (v instanceof Iterable) {
                for (Object item : (Iterable<?>) v) {
                    if (item instanceof CharSequence) appendPart(sb, item.toString());
                }
            }
            if (sb.length() >= MAX_EXTRA_LEN) break;
        }
        return sb.toString();
    }

    private static void appendPart(StringBuilder sb, String s) {
        if (s == null) return;
        String t = s.trim();
        if (t.isEmpty() || t.startsWith("android.") || t.startsWith("com.android.")) return;
        if (t.length() > MAX_PART_LEN) t = t.substring(0, MAX_PART_LEN);
        if (sb.indexOf(t) >= 0) return;
        if (sb.length() > 0) sb.append(" ⏎ ");
        sb.append(t);
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }
}
