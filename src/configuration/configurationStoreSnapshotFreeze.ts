import type { ConfigurationStoreSnapshot } from "./configurationStoreSnapshot.js"

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value

  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

export function configurationStoreSnapshotFreeze(snapshot: ConfigurationStoreSnapshot): ConfigurationStoreSnapshot {
  return deepFreeze(snapshot)
}
