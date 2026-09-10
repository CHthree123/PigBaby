package com.pigbaby.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 自动记账（通知监听）桥接：
 * - 检查/跳转通知使用权设置（该权限只能用户手动授予）
 * - 拉取/清除原生侧捕获的通知
 * - App 存活时通过 capture 事件实时通知 JS
 */
@CapacitorPlugin(name = "AutoCapture")
public class AutoCapturePlugin extends Plugin {

    public static final String EVENT_CAPTURED = "com.pigbaby.app.NOTIF_CAPTURED";

    private BroadcastReceiver receiver;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                JSObject data = new JSObject();
                data.put("fresh", true);
                notifyListeners("capture", data);
            }
        };
        IntentFilter filter = new IntentFilter(EVENT_CAPTURED);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {
            }
            receiver = null;
        }
        super.handleOnDestroy();
    }

    private boolean isListenerEnabled() {
        String flat = Settings.Secure.getString(
                getContext().getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(getContext().getPackageName());
    }

    @PluginMethod
    public void checkEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", isListenerEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("无法打开通知使用权设置：" + e.getMessage());
        }
    }

    @PluginMethod
    public void pullCaptured(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("captures", NotifStore.peek(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void clearCaptured(PluginCall call) {
        JSArray ids = call.getArray("ids");
        NotifStore.clear(getContext(), ids);
        call.resolve();
    }
}
