package com.pigbaby.app;

import android.Manifest;
import android.content.pm.PackageManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.NativePlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

/**
 * Reads payment SMS. Uses the legacy permission flow (@NativePlugin +
 * handleRequestPermissionsResult) because the modern @CapacitorPlugin
 * permission launcher rejected immediately without showing the system dialog
 * on the user's device. Here we request READ_SMS/RECEIVE_SMS directly via
 * ActivityCompat and resolve the JS call from handleRequestPermissionsResult.
 */
@NativePlugin(
        name = "SmsReader",
        permissionRequestCode = 7711
)
public class SmsReaderPlugin extends Plugin {

    private static final int SMS_PERMISSION_REQUEST = 7711;

    private PluginCall pendingPermissionCall;

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
        if (getActivity() == null) {
            call.reject("activity unavailable, cannot request permission");
            return;
        }
        pendingPermissionCall = call;
        ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS},
                SMS_PERMISSION_REQUEST
        );
    }

    @Override
    protected void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != SMS_PERMISSION_REQUEST || pendingPermissionCall == null) {
            return;
        }
        PluginCall call = pendingPermissionCall;
        pendingPermissionCall = null;
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
