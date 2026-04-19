package expo.modules.vehicleactivity

/**
 * Pont minimal entre le [BroadcastReceiver] Play Services et le module Expo (sendEvent).
 */
object VehicleActivityBridge {
  @Volatile
  var onActivityType: ((String) -> Unit)? = null
}
