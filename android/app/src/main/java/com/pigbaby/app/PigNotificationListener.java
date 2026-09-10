package com.pigbaby.app;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 自动记账采集层：只读取微信与支付宝两个包的通知，保存标题/正文等文本，
 * 其余 App 的通知直接忽略（不落盘、不处理）。解析与打标在 JS 层进行，
 * 便于不重新编译原生代码即可校准规则。
 */
public class PigNotificationListener extends NotificationListenerService {

    private static final Set<String> WATCHED = new HashSet<>(Arrays.asList(
            "com.tencent.mm",
            "com.eg.android.AlipayGphone"
    ));

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
        String sub = str(extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        if (title.isEmpty() && text.isEmpty() && big.isEmpty()) return;

        long when = sbn.getPostTime() > 0 ? sbn.getPostTime() : System.currentTimeMillis();
        NotifStore.add(this, pkg, title, text, big, sub, when);

        Intent i = new Intent(AutoCapturePlugin.EVENT_CAPTURED);
        i.setPackage(getPackageName());
        sendBroadcast(i);
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }
}
