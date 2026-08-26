package com.pigbaby.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Hide the status bar so the app occupies the very top of the screen
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);

    // Disable WebView cache during development so updates always load fresh
    WebView webView = getBridge().getWebView();
    webView.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);

    registerPlugin(SmsReaderPlugin.class);
    createReminderChannel();
  }

  /**
   * Task-reminder channel with HIGH importance, the system default notification
   * sound and vibration, and public lockscreen visibility. Must be created
   * natively: the JS createChannel API silently creates a channel without sound
   * or vibration (sound defaults to null, vibrate to false).
   */
  private void createReminderChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationChannel channel = new NotificationChannel(
        "pigbaby_reminders", "任务提醒", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("任务准点提醒");
    AudioAttributes attrs = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .build();
    channel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attrs);
    channel.enableVibration(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    nm.createNotificationChannel(channel);
  }
}
