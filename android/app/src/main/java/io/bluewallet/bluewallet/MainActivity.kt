package com.martianrepublic.app

import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import kotlin.math.max

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "BlueWallet"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    // null: react-native-screens cannot restore its fragments from saved state
    super.onCreate(null)
    if (resources.getBoolean(R.bool.portrait_only)) {
      requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
    keepContentInsideSystemBars()
  }

  /**
   * Android 15+ (and every app that targets API 36) draws the window behind the status and
   * navigation bars. The screens of this app were laid out for a window that ends at those bars,
   * so the content view is padded by the bar, cutout and keyboard insets and the insets are
   * consumed here. React Native, react-native-screens and react-native-safe-area-context then
   * see a window without insets, as they did before edge-to-edge was enforced.
   */
  private fun keepContentInsideSystemBars() {
    val content = findViewById<View>(android.R.id.content)
    // Shows through behind the transparent system bars: the background of both app themes.
    content.setBackgroundColor(Color.parseColor("#080A0C"))
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars =
          insets.getInsets(
              WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, max(bars.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }
  }
}
