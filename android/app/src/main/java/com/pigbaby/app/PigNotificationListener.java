package com.pigbaby.app;

import android.app.Notification;
import android.app.Person;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import com.getcapacitor.JSObject;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 自动记账采集层：只读取下列 8 个包的通知（微信 / 支付宝 / 抖音 / 淘宝 / 京东 /
 * 拼多多 / 美团 / 云闪付），保存所有可见文本，其余 App 的通知直接忽略（不落盘、不处理）。
 * 解析、过滤、学习与打标全部在 JS 层进行，便于不重新编译原生代码即可校准规则。
 */
public class PigNotificationListener extends NotificationListenerService {

    private static PigNotificationListener instance;

    private static final Map<String, String> APP_LABELS = new HashMap<>();

    static {
        APP_LABELS.put("com.tencent.mm", "微信");
        APP_LABELS.put("com.eg.android.AlipayGphone", "支付宝");
        APP_LABELS.put("com.ss.android.ugc.aweme", "抖音");
        APP_LABELS.put("com.taobao.taobao", "淘宝");
        APP_LABELS.put("com.jingdong.app.mall", "京东");
        APP_LABELS.put("com.xunmeng.pinduoduo", "拼多多");
        APP_LABELS.put("com.sankuai.meituan", "美团");
        APP_LABELS.put("com.unionpay", "云闪付");
    }

    private static final Set<String> WATCHED = APP_LABELS.keySet();

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
    private static final int MAX_DUMP_LEN = 1600;
    private static final int MAX_DEPTH = 3;

    // 账单类关键词预筛：各 App 里大量普通消息（聊天/推送）不含任何上述字样，直接丢弃，
    // 避免队列与调试页被无关消息淹没（宁可多留，不可漏抓；精细过滤在 JS 层做）
    private static final String[] FINANCE_HINTS = {
            "¥", "￥", "元", "扣", "到账", "收款", "退款", "转账", "收入", "支出",
            "消费", "账单", "支付", "余额", "红包", "付款", "实付", "已付", "入账", "退回", "充值"
    };

    private static boolean looksLikeFinance(String all) {
        for (String hint : FINANCE_HINTS) {
            if (all.contains(hint)) return true;
        }
        return false;
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        instance = this;
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        if (instance == this) instance = null;
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    /** 监听服务当前是否连上（被系统/省电策略杀掉时会断开） */
    public static boolean isConnected() {
        return instance != null;
    }

    /** 扫描当前通知栏，补抓还在栏里但未被记录的通知（返回新增条数） */
    public static int scanActive(Context context) {
        PigNotificationListener svc = instance;
        if (svc == null) return 0;
        int added = 0;
        try {
            StatusBarNotification[] active = svc.getActiveNotifications();
            if (active == null) return 0;
            for (StatusBarNotification sbn : active) {
                if (capture(context, sbn)) added++;
            }
        } catch (Exception ignored) {
        }
        return added;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        capture(this, sbn);
    }

    /** 过滤 → 提取文本 → 入库；返回是否新入库 */
    private static boolean capture(Context context, StatusBarNotification sbn) {
        if (sbn == null) return false;
        String pkg = sbn.getPackageName();
        if (pkg == null || !WATCHED.contains(pkg)) return false;
        Notification n = sbn.getNotification();
        if (n == null) return false;
        Bundle extras = n.extras;
        if (extras == null) return false;

        String title = str(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = str(extras.getCharSequence(Notification.EXTRA_TEXT));
        String big = str(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        String ticker = n.tickerText == null ? "" : n.tickerText.toString();
        if (title.isEmpty() && text.isEmpty() && big.isEmpty() && ticker.isEmpty()) return false;
        if (!looksLikeFinance(title + " " + text + " " + big + " " + ticker)) return false;

        JSObject o = new JSObject();
        o.put("pkg", pkg);
        o.put("app", APP_LABELS.containsKey(pkg) ? APP_LABELS.get(pkg) : pkg);
        o.put("title", title);
        o.put("text", text);
        o.put("bigText", big);
        o.put("subText", str(extras.getCharSequence(Notification.EXTRA_SUB_TEXT)));
        o.put("summaryText", str(extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)));
        o.put("infoText", str(extras.getCharSequence(Notification.EXTRA_INFO_TEXT)));
        o.put("titleBig", str(extras.getCharSequence(Notification.EXTRA_TITLE_BIG)));
        o.put("conversationTitle", str(extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)));
        o.put("ticker", ticker);
        o.put("extraText", collectExtraText(extras, 0));
        o.put("rawDump", dumpExtras(extras, 0));
        o.put("when", sbn.getPostTime() > 0 ? sbn.getPostTime() : System.currentTimeMillis());

        if (!NotifStore.add(context, o)) return false;

        Intent i = new Intent(AutoCapturePlugin.EVENT_CAPTURED);
        i.setPackage(context.getPackageName());
        context.sendBroadcast(i);
        return true;
    }

    /**
     * 收集 extras 里其他所有文本（值，不含键），供解析使用：
     * 含多行样式 textLines、MessageStyle 的嵌套消息体（Bundle 内的 text/sender）、
     * 发送人姓名等；每段截断 160 字、总计 800 字、去重。
     */
    private static String collectExtraText(Bundle extras, int depth) {
        StringBuilder sb = new StringBuilder();
        for (String key : extras.keySet()) {
            if (HANDLED_KEYS.contains(key) || Notification.EXTRA_TEMPLATE.equals(key)) continue;
            collectValue(sb, extras.get(key), depth);
            if (sb.length() >= MAX_EXTRA_LEN) break;
        }
        return sb.toString();
    }

    private static void collectValue(StringBuilder sb, Object v, int depth) {
        if (v == null || depth > MAX_DEPTH) return;
        if (v instanceof CharSequence) {
            appendPart(sb, v.toString());
        } else if (v instanceof Bundle) {
            Bundle b = (Bundle) v;
            for (String k : b.keySet()) {
                collectValue(sb, b.get(k), depth + 1);
            }
        } else if (v instanceof Iterable) {
            for (Object item : (Iterable<?>) v) {
                collectValue(sb, item, depth + 1);
            }
        } else if (Build.VERSION.SDK_INT >= 28 && v instanceof Person) {
            Person p = (Person) v;
            if (p.getName() != null) appendPart(sb, p.getName().toString());
        }
    }

    /** 原始转储（key=value，仅调试页展示，不参与解析） */
    private static String dumpExtras(Bundle extras, int depth) {
        StringBuilder sb = new StringBuilder();
        for (String key : extras.keySet()) {
            dumpEntry(sb, key, extras.get(key), depth);
            if (sb.length() >= MAX_DUMP_LEN) break;
        }
        return sb.toString();
    }

    private static void dumpEntry(StringBuilder sb, String key, Object v, int depth) {
        if (v == null || depth > MAX_DEPTH) return;
        if (v instanceof CharSequence) {
            appendDump(sb, key + "=" + v);
        } else if (v instanceof Bundle) {
            Bundle b = (Bundle) v;
            StringBuilder inner = new StringBuilder();
            for (String k : b.keySet()) {
                Object iv = b.get(k);
                if (iv instanceof CharSequence) {
                    inner.append(k).append("=").append(iv).append("; ");
                } else if (Build.VERSION.SDK_INT >= 28 && iv instanceof Person && ((Person) iv).getName() != null) {
                    inner.append(k).append("=Person(").append(((Person) iv).getName()).append("); ");
                }
            }
            if (inner.length() > 0) appendDump(sb, key + "={" + inner + "}");
        } else if (v instanceof Iterable) {
            StringBuilder inner = new StringBuilder();
            for (Object item : (Iterable<?>) v) {
                if (item instanceof CharSequence) {
                    inner.append(item).append("; ");
                } else if (item instanceof Bundle) {
                    Bundle b = (Bundle) item;
                    StringBuilder one = new StringBuilder();
                    for (String k : b.keySet()) {
                        Object iv = b.get(k);
                        if (iv instanceof CharSequence) one.append(k).append("=").append(iv).append(" ");
                        else if (Build.VERSION.SDK_INT >= 28 && iv instanceof Person && ((Person) iv).getName() != null) {
                            one.append(k).append("=Person(").append(((Person) iv).getName()).append(") ");
                        }
                    }
                    if (one.length() > 0) inner.append("{").append(one).append("}; ");
                } else if (Build.VERSION.SDK_INT >= 28 && item instanceof Person && ((Person) item).getName() != null) {
                    inner.append("Person(").append(((Person) item).getName()).append("); ");
                }
            }
            if (inner.length() > 0) appendDump(sb, key + "=[" + inner + "]");
        }
    }

    private static void appendPart(StringBuilder sb, String s) {
        String t = clean(s);
        if (t == null) return;
        if (sb.indexOf(t) >= 0) return;
        if (sb.length() > 0) sb.append(" ⏎ ");
        sb.append(t);
    }

    private static void appendDump(StringBuilder sb, String s) {
        String t = clean(s);
        if (t == null) return;
        if (sb.indexOf(t) >= 0) return;
        if (sb.length() > 0) sb.append(" ⏎ ");
        sb.append(t);
    }

    private static String clean(String s) {
        if (s == null) return null;
        String t = s.trim();
        if (t.isEmpty() || t.startsWith("android.") || t.startsWith("com.android.")) return null;
        if (t.length() > MAX_PART_LEN) t = t.substring(0, MAX_PART_LEN);
        return t;
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }
}
