package com.chartmate

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var insetJs: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView

    // Android WebView doesn't populate env(safe-area-inset-*) automatically even with
    // enableEdgeToEdge + viewport-fit=cover. Listen for real inset values and inject
    // them as CSS custom properties. Re-inject on focus/resume to cover initial page load.
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, windowInsets ->
      val insets = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val d = resources.displayMetrics.density
      insetJs = "document.documentElement.style.setProperty('--sat','${(insets.top / d).toInt()}px');" +
                "document.documentElement.style.setProperty('--sar','${(insets.right / d).toInt()}px');" +
                "document.documentElement.style.setProperty('--sab','${(insets.bottom / d).toInt()}px');" +
                "document.documentElement.style.setProperty('--sal','${(insets.left / d).toInt()}px');"
      injectInsets()
      ViewCompat.onApplyWindowInsets(view, windowInsets)
    }
  }

  // onWindowFocusChanged fires after the page has loaded on first launch.
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) injectInsets()
  }

  // onResume covers re-entry from background.
  override fun onResume() {
    super.onResume()
    injectInsets()
  }

  private fun injectInsets() {
    val js = insetJs ?: return
    webView?.post { webView?.evaluateJavascript(js, null) }
  }
}
