/** Mis à true uniquement si `TaskManager.defineTask` a réussi (build dev client avec module natif). */
export let isKmBackgroundTasksRegistered = false;

export function setKmBackgroundTasksRegistered(value: boolean): void {
  isKmBackgroundTasksRegistered = value;
}
