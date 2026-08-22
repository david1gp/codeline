import { createResult, createResultError, type Result } from "@adaptive-ds/result"

const managedPostgresPort = "6002"
const loopbackHostnames = new Set(["localhost", "::1", "0:0:0:0:0:0:0:1"])

function environmentValueRead(name: string): string | undefined {
  const value = Bun.env[name]
  if (value === undefined || value.trim().length === 0) return undefined
  return value.trim()
}

function hostnameIsLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  if (loopbackHostnames.has(normalized)) return true
  if (/^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)
}

export function managedPostgresTargetAssert(): Result<{ databaseUrl: string }> {
  const op = "managedPostgresTargetAssert"
  const nodeEnvironment = environmentValueRead("NODE_ENV")
  if (nodeEnvironment !== "development") {
    return createResultError(op, "PostgreSQL reset requires NODE_ENV=development.")
  }

  const databaseUrl = environmentValueRead("DATABASE_URL")
  const postgresDatabase = environmentValueRead("POSTGRES_DB")
  const postgresPort = environmentValueRead("POSTGRES_PORT")
  const postgresUser = environmentValueRead("POSTGRES_USER")
  if (
    databaseUrl === undefined ||
    postgresDatabase === undefined ||
    postgresPort === undefined ||
    postgresUser === undefined
  ) {
    return createResultError(op, "DATABASE_URL, POSTGRES_DB, POSTGRES_PORT, and POSTGRES_USER are required.")
  }
  if (postgresPort !== managedPostgresPort) {
    return createResultError(
      op,
      `POSTGRES_PORT must equal ${managedPostgresPort} for the managed development PostgreSQL service.`,
    )
  }

  let databaseTarget: URL
  try {
    databaseTarget = new URL(databaseUrl)
  } catch (_error) {
    return createResultError(op, "DATABASE_URL is not a valid connection URL.")
  }

  if (databaseTarget.protocol !== "postgres:" && databaseTarget.protocol !== "postgresql:") {
    return createResultError(op, "DATABASE_URL must use the PostgreSQL connection scheme.")
  }
  if (!hostnameIsLoopback(databaseTarget.hostname)) {
    return createResultError(op, "PostgreSQL reset is limited to a loopback managed database host.")
  }
  if (databaseTarget.port !== managedPostgresPort) {
    return createResultError(op, "DATABASE_URL does not address the managed development PostgreSQL port.")
  }
  if (databaseTarget.username !== postgresUser) {
    return createResultError(op, "DATABASE_URL does not use the managed development PostgreSQL user.")
  }
  if (databaseTarget.pathname.replace(/^\//, "") !== postgresDatabase) {
    return createResultError(op, "DATABASE_URL does not address the managed development PostgreSQL database.")
  }

  return createResult({ databaseUrl })
}
