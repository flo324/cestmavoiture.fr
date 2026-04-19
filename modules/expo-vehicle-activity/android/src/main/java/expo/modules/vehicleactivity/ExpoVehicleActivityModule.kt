package expo.modules.vehicleactivity

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.tasks.Tasks
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class ExpoVehicleActivityModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  private var receiver: VehicleActivityBroadcastReceiver? = null
  private var pendingIntent: PendingIntent? = null

  init {
    Companion.moduleRef = WeakReference(this)
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoVehicleActivity")

    Events("onActivityChange")

    AsyncFunction("startListening") {
      val ctx = appContext.reactContext ?: throw Exception("Contexte React indisponible")
      stopInternal(ctx)

      VehicleActivityBridge.onActivityType = { type ->
        ExpoVehicleActivityModule.moduleRef?.get()?.let { mod ->
          mod.mainHandler.post {
            mod.sendEvent("onActivityChange", mapOf("type" to type))
          }
        }
      }

      val intent = Intent(ctx, VehicleActivityBroadcastReceiver::class.java)
      val flags =
        PendingIntent.FLAG_UPDATE_CURRENT or
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE
          } else {
            0
          }
      val pi = PendingIntent.getBroadcast(ctx, REQUEST_CODE, intent, flags)
      pendingIntent = pi

      receiver = VehicleActivityBroadcastReceiver()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ctx.registerReceiver(
          receiver,
          IntentFilter(),
          Context.RECEIVER_NOT_EXPORTED
        )
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        ctx.registerReceiver(receiver, IntentFilter())
      }

      val client = ActivityRecognition.getClient(ctx)
      Tasks.await(client.requestActivityUpdates(4000L, pi))
      true
    }

    AsyncFunction("stopListening") {
      VehicleActivityBridge.onActivityType = null
      val ctx = appContext.reactContext
      if (ctx != null) {
        stopInternal(ctx)
      }
    }
  }

  private fun stopInternal(ctx: Context) {
    pendingIntent?.let { pi ->
      try {
        Tasks.await(ActivityRecognition.getClient(ctx).removeActivityUpdates(pi))
      } catch (_: Exception) {
      }
    }
    pendingIntent = null

    receiver?.let { r ->
      try {
        ctx.unregisterReceiver(r)
      } catch (_: Exception) {
      }
    }
    receiver = null
  }

  companion object {
    @Volatile
    var moduleRef: WeakReference<ExpoVehicleActivityModule>? = null

    private const val REQUEST_CODE = 0x4F54544F
  }
}
