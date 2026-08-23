/**
 * Single device-local IndexedDB used for settled-session snapshots. Records are
 * namespaced by application user inside the database, so one database serves
 * every account that has been locally active on this device.
 */
export const sessionSettledCacheDatabaseConfig = {
  name: "codeline-settled-sessions",
  version: 2,
} as const
