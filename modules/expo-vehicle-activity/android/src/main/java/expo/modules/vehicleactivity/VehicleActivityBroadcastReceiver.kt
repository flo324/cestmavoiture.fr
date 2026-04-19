package expo.modules.vehicleactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity

class VehicleActivityBroadcastReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context?, intent: Intent?) {
    if (intent == null) return
    if (!ActivityRecognitionResult.hasResult(intent)) return
    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    val act = result.mostProbableActivity ?: return
    val type = mapDetectedType(act.type)
    VehicleActivityBridge.onActivityType?.invoke(type)
  }

  private fun mapDetectedType(type: Int): String {
    return when (type) {
      DetectedActivity.IN_VEHICLE -> "in_vehicle"
      DetectedActivity.ON_BICYCLE -> "on_bicycle"
      DetectedActivity.ON_FOOT -> "on_foot"
      DetectedActivity.RUNNING -> "running"
      DetectedActivity.WALKING -> "walking"
      DetectedActivity.STILL -> "still"
      else -> "unknown"
    }
  }
}
