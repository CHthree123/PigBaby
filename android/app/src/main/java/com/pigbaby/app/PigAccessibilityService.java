package com.pigbaby.app;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 无障碍读取（实验）：只接收微信与支付宝两个包的事件（见 accessibility_config.xml），
 * 在页面文本看起来是账单/支付相关内容时才保存整屏文字，供校准与后续提取规则使用。
 * 其余应用完全不读取；即使是这两个应用，不含金额与账单关键词的页面也不会保存。
 */
public class PigAccessibilityService extends AccessibilityService {

    private static final Set<String> WATCHED = new HashSet<>(Arrays.asList(
            "com.tencent.mm",
            "com.eg.android.AlipayGphone"
    ));

    private static final String[] FINANCE_HINTS = {
            "¥", "￥", "账单", "交易", "明细", "退款", "扣费", "到账", "收款", "付款", "支出", "收入", "金额", "余额"
    };

    private static final int MAX_TEXT_LEN = 4000;
    private static final int MAX_DEPTH = 40;
    private static final long THROTTLE_MS = 1200;

    private long lastCaptureAt = 0;
    private String lastHash = "";

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        CharSequence pkgCs = event.getPackageName();
        String pkg = pkgCs == null ? "" : pkgCs.toString();
        if (!WATCHED.contains(pkg)) return;

        int type = event.getEventType();
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return;

        long now = System.currentTimeMillis();
        if (now - lastCaptureAt < THROTTLE_MS) return;
        lastCaptureAt = now;

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        StringBuilder sb = new StringBuilder();
        Set<String> seen = new HashSet<>();
        collect(root, sb, seen, 0);
        String text = sb.toString().trim();
        if (text.length() < 8 || !looksFinance(text)) return;

        String hash = Integer.toHexString(text.hashCode());
        if (hash.equals(lastHash)) return;
        lastHash = hash;

        String app = "com.tencent.mm".equals(pkg) ? "微信" : "支付宝";
        AccessStore.add(this, pkg, app, text);
    }

    /** 遍历可见节点收集文字（text + contentDescription），去重并限制总量 */
    private void collect(AccessibilityNodeInfo node, StringBuilder sb, Set<String> seen, int depth) {
        if (node == null || depth > MAX_DEPTH || sb.length() >= MAX_TEXT_LEN) return;
        CharSequence text = node.getText();
        if (text != null) appendLine(sb, seen, text.toString());
        CharSequence desc = node.getContentDescription();
        if (desc != null) appendLine(sb, seen, desc.toString());
        int count = node.getChildCount();
        for (int i = 0; i < count; i++) {
            if (sb.length() >= MAX_TEXT_LEN) break;
            collect(node.getChild(i), sb, seen, depth + 1);
        }
    }

    private void appendLine(StringBuilder sb, Set<String> seen, String s) {
        String t = s.trim();
        if (t.isEmpty() || t.length() > 200) return;
        if (!seen.add(t)) return;
        if (sb.length() > 0) sb.append('\n');
        sb.append(t);
    }

    /** 必须同时含数字与账单类关键词才认为是有效页面，避免误存普通聊天 */
    private boolean looksFinance(String text) {
        boolean hasDigit = false;
        for (int i = 0; i < text.length(); i++) {
            if (Character.isDigit(text.charAt(i))) {
                hasDigit = true;
                break;
            }
        }
        if (!hasDigit) return false;
        for (String hint : FINANCE_HINTS) {
            if (text.contains(hint)) return true;
        }
        return false;
    }

    @Override
    public void onInterrupt() {
        // 无需处理
    }
}
