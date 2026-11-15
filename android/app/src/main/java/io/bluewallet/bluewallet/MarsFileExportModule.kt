package com.martianrepublic.app

import android.app.Activity
import android.content.Intent
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.IOException

/**
 * Saves a text file where the person chooses, through the system "save as" screen
 * (ACTION_CREATE_DOCUMENT). The app holds no storage permission: Android hands back access to
 * the one file that was created.
 */
class MarsFileExportModule(context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context), ActivityEventListener {

  private var pending: Promise? = null
  private var pendingText: String? = null

  init {
    context.addActivityEventListener(this)
  }

  override fun getName(): String = "MarsFileExport"

  /** Resolves true when the file was written, false when the person closed the screen. */
  @ReactMethod
  fun save(fileName: String, mimeType: String, text: String, promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("no_activity", "The app is not on screen.")
      return
    }
    if (pending != null) {
      promise.reject("busy", "Another file is being saved.")
      return
    }
    val intent =
        Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = mimeType
          putExtra(Intent.EXTRA_TITLE, fileName)
        }
    pending = promise
    pendingText = text
    try {
      activity.startActivityForResult(intent, REQUEST_SAVE)
    } catch (e: Exception) {
      pending = null
      pendingText = null
      promise.reject("unavailable", "This device has no app for saving files.", e)
    }
  }

  override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?
  ) {
    if (requestCode != REQUEST_SAVE) return
    val promise = pending ?: return
    val text = pendingText ?: ""
    pending = null
    pendingText = null
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.resolve(false)
      return
    }
    try {
      val stream =
          reactApplicationContext.contentResolver.openOutputStream(uri, "wt")
              ?: throw IOException("The file could not be opened.")
      stream.use { it.write(text.toByteArray(Charsets.UTF_8)) }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("write_failed", "The file could not be saved.", e)
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  companion object {
    private const val REQUEST_SAVE = 0x4d46
  }
}

class MarsFileExportPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
      listOf(MarsFileExportModule(context))

  override fun createViewManagers(
      context: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
