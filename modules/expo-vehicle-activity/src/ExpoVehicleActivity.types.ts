export type VehicleActivityPayload = {
  type: string;
};

export type ExpoVehicleActivityModuleEvents = {
  onActivityChange: (params: VehicleActivityPayload) => void;
};
