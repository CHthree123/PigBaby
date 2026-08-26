package com.pigbaby.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import com.getcapacitor.JSObject;

/**
 * Manifest-registered SMS receiver: works even when the app is closed.
 * Parsed records are queued in SharedPreferences and picked up by JS
 * (via SmsReaderPlugin.syncPending) on the next app launch.
 */
public class SmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) return;
        StringBuilder body = new StringBuilder();
        long time = System.currentTimeMillis();
        for (SmsMessage msg : messages) {
            if (msg.getMessageBody() != null) body.append(msg.getMessageBody());
            time = msg.getTimestampMillis();
        }
        if (body.length() == 0) return;
        JSObject parsed = SmsParser.parse(body.toString(), time);
        if (parsed != null) {
            SmsStore.addPending(context, parsed);
        }
    }
}
