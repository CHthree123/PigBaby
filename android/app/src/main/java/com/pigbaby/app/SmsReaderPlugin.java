package com.pigbaby.app;

import android.Manifest;
import android.content.pm.PackageManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
        name = "SmsReader",
        permissions = {
                @Permission(alias = "sms", strings = {Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS})
        }
)
public class SmsReaderPlugin extends Plugin {

    private boolean hasSmsPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_SMS)
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasSmsPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasSmsPermission()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("sms", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasSmsPermission());
        call.resolve(ret);
    }

    /** Pull payment records captured while the app was closed */
    @PluginMethod
    public void syncPending(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("records", SmsStore.takePending(getContext()));
        call.resolve(ret);
    }

    /** One-shot import: parse the most recent payment SMS from the inbox */
    @PluginMethod
    public void queryRecent(PluginCall call) {
        int limit = call.getInt("limit", 20);
        JSObject ret = new JSObject();
        ret.put("records", SmsStore.queryRecent(getContext(), limit));
        call.resolve(ret);
    }
}
