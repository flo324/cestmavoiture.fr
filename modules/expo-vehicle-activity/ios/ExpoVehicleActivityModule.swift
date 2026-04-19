import CoreMotion
import ExpoModulesCore

public class ExpoVehicleActivityModule: Module {
  private let motionManager = CMMotionActivityManager()
  private let motionQueue = OperationQueue()

  public func definition() -> ModuleDefinition {
    Name("ExpoVehicleActivity")

    Events("onActivityChange")

    AsyncFunction("startListening") { () -> Bool in
      guard CMMotionActivityManager.isActivityAvailable() else {
        return false
      }
      self.motionQueue.name = "expo.vehicle.activity"
      self.motionManager.startActivityUpdates(to: self.motionQueue) { activity in
        guard let a = activity else { return }
        let type: String
        if a.automotive {
          type = "automotive"
        } else if a.cycling {
          type = "on_bicycle"
        } else if a.running {
          type = "running"
        } else if a.walking {
          type = "walking"
        } else if a.stationary {
          type = "still"
        } else {
          type = "unknown"
        }
        DispatchQueue.main.async {
          self.sendEvent("onActivityChange", ["type": type])
        }
      }
      return true
    }

    AsyncFunction("stopListening") {
      self.motionManager.stopActivityUpdates()
    }
  }
}
