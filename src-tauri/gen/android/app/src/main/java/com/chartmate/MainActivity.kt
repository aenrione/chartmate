package com.chartmate

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Called by Wry after the WebView is created — capture reference and wire up inset injection.
  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView

    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, windowInsets ->
      val insets = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val density = resources.displayMetrics.density
      val top    = (insets.top    / density).toInt()
      val bottom = (insets.bottom / density).toInt()
      val left   = (insets.left   / density).toInt()
      val right  = (insets.right  / density).toInt()

      // Inject actual inset values as CSS custom properties so var(--sat/sar/sab/sal) works
      // even when env(safe-area-inset-*) returns 0 on Android WebView.
      val js = "document.documentElement.style.setProperty('--sat','${top}px');" +
               "document.documentElement.style.setProperty('--sar','${right}px');" +
               "document.documentElement.style.setProperty('--sab','${bottom}px');" +
               "document.documentElement.style.setProperty('--sal','${left}px');"
      webView.post { webView.evaluateJavascript(js, null) }

      ViewCompat.onApplyWindowInsets(view, windowInsets)
    }
  }
}
