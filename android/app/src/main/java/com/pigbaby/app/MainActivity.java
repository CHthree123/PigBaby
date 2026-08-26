package com.pigbaby.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Disable WebView cache during development so updates always load fresh
    WebView webView = getBridge().getWebView();
    webView.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);

    registerPlugin(SmsReaderPlugin.class);
  }
}
