package com.pigbaby.app;

import com.getcapacitor.JSObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses payment notification SMS (微信/支付宝/bank) into a bookkeeping record.
 * Returns null when the message does not look like a payment notification.
 */
public class SmsParser {

    private static final Pattern AMOUNT = Pattern.compile("(\\d+(?:[.,]\\d{1,2})?)\\s*元");
    private static final String[] INCOME_WORDS = {"收入", "到账", "退款", "转入", "收款", "收到", "入账"};
    private static final String[] EXPENSE_WORDS = {"支出", "消费", "付款", "支付", "扣款", "转出", "购买", "代扣"};
    private static final String[] MERCHANT_PATTERNS = {
            "向(.{1,12}?)(?:支付|付款|转账)",
            "在(.{1,12}?)(?:消费|支付)",
            "到(.{1,12}?)(?:消费|支付)"
    };
    private static final String[][] SOURCES = {
            {"微信支付", "微信"}, {"财付通", "微信"}, {"支付宝", "支付宝"}, {"云闪付", "云闪付"},
            {"招商银行", "招商银行"}, {"建设银行", "建设银行"}, {"工商银行", "工商银行"},
            {"农业银行", "农业银行"}, {"中国银行", "中国银行"}, {"交通银行", "交通银行"},
            {"邮政储蓄", "邮政储蓄"}, {"邮储", "邮政储蓄"}, {"中信银行", "中信银行"},
            {"浦发银行", "浦发银行"}, {"民生银行", "民生银行"}, {"光大银行", "光大银行"},
            {"平安银行", "平安银行"}, {"兴业银行", "兴业银行"}, {"广发银行", "广发银行"},
            {"微众银行", "微众银行"}, {"京东金融", "京东金融"}
    };

    public static JSObject parse(String body, long timeMillis) {
        if (body == null || body.isEmpty()) return null;
        Matcher m = AMOUNT.matcher(body);
        if (!m.find()) return null;
        double amount;
        try {
            amount = Double.parseDouble(m.group(1).replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
        if (amount <= 0) return null;

        String type = "expense";
        for (String w : INCOME_WORDS) {
            if (body.contains(w)) {
                type = "income";
                break;
            }
        }
        if ("expense".equals(type)) {
            for (String w : EXPENSE_WORDS) {
                if (body.contains(w)) {
                    type = "expense";
                    break;
                }
            }
        }

        String source = detectSource(body);
        String merchant = extractMerchant(body);
        String note = source + (merchant.isEmpty() ? "" : " " + merchant);

        JSObject obj = new JSObject();
        obj.put("amount", amount);
        obj.put("type", type);
        obj.put("note", note.trim());
        obj.put("source", source);
        obj.put("merchant", merchant);
        obj.put("date", new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date(timeMillis)));
        obj.put("time", timeMillis);
        obj.put("raw", body.length() > 80 ? body.substring(0, 80) : body);
        return obj;
    }

    private static String detectSource(String body) {
        for (String[] s : SOURCES) {
            if (body.contains(s[0])) return s[1];
        }
        return "短信";
    }

    private static String extractMerchant(String body) {
        for (String p : MERCHANT_PATTERNS) {
            Matcher m = Pattern.compile(p).matcher(body);
            if (m.find()) {
                String name = m.group(1).trim();
                if (!name.isEmpty()) return name;
            }
        }
        return "";
    }
}
