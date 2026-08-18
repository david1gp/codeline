import { createResult, createResultError, type Result } from "@adaptive-ds/result"

export type E2eLocalEnvironment = {
  databaseUrl: string
  issuer: string
  organizationExternalId: string
  publicOrigin: string
}

const loopbackHostnames = new Set(["localhost", "::1", "0:0:0:0:0:0:0:1"])
const managedPublicOrigin = "https://preview.codeline.work"

function environmentValueRead(name: string): string | undefined {
  const value = Bun.env[name]
  if (value === undefined || value.trim().length === 0) return undefined
  return value.trim()
}

/**
 * Accepts only hosts that cannot leave the machine. `URL` keeps IPv6 hosts in
 * their bracketed form, so the brackets are removed before the comparison and
 * the whole IPv4 loopback block is matched instead of `127.0.0.1` alone.
 */
function hostnameIsLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  if (loopbackHostnames.has(normalized)) return true
  if (/^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)
}

/**
 * Refuses every end-to-end setup or cleanup run that does not target the
 * repository-managed local development database and preview origin. The check
 * compares `DATABASE_URL` against the managed compose credentials from `.env`,
 * so a staging or production connection string can never be mutated by the
 * synthetic identity fixture.
 */
export function e2eEnvironmentAssertLocal(): Result<E2eLocalEnvironment> {
  const op = "e2eEnvironmentAssertLocal"

  const nodeEnvironment = environmentValueRead("NODE_ENV")
  if (nodeEnvironment !== "development") {
    return createResultError(op, "End-to-end identity fixtures require NODE_ENV=development.")
  }

  const databaseUrl = environmentValueRead("DATABASE_URL")
  if (databaseUrl === undefined) {
    return createResultError(op, "DATABASE_URL is required to run end-to-end identity fixtures.")
  }

  const postgresDatabase = environmentValueRead("POSTGRES_DB")
  const postgresPort = environmentValueRead("POSTGRES_PORT")
  const postgresUser = environmentValueRead("POSTGRES_USER")
  if (postgresDatabase === undefined || postgresPort === undefined || postgresUser === undefined) {
    return createResultError(op, "POSTGRES_DB, POSTGRES_PORT, and POSTGRES_USER of the managed database are required.")
  }

  let databaseTarget: URL
  try {
    databaseTarget = new URL(databaseUrl)
  } catch (_error) {
    return createResultError(op, "DATABASE_URL is not a valid connection URL.")
  }

  if (!hostnameIsLoopback(databaseTarget.hostname)) {
    return createResultError(op, "End-to-end identity fixtures only run against a loopback database host.")
  }
  if (databaseTarget.port !== postgresPort) {
    return createResultError(op, "DATABASE_URL does not address the repository-managed development database port.")
  }
  if (databaseTarget.username !== postgresUser) {
    return createResultError(op, "DATABASE_URL does not use the repository-managed development database user.")
  }
  if (databaseTarget.pathname.replace(/^\//, "") !== postgresDatabase) {
    return createResultError(op, "DATABASE_URL does not address the repository-managed development database name.")
  }

  const publicOrigin = environmentValueRead("PUBLIC_ORIGIN") ?? managedPublicOrigin
  if (publicOrigin !== managedPublicOrigin) {
    return createResultError(op, `End-to-end identity fixtures only run against ${managedPublicOrigin}.`)
  }

  const issuer = environmentValueRead("ZITADEL_ISSUER")
  if (issuer === undefined) {
    return createResultError(op, "ZITADEL_ISSUER is required to run end-to-end identity fixtures.")
  }

  const organizationExternalId = environmentValueRead("ZITADEL_ORGANIZATION_ID")
  if (organizationExternalId === undefined) {
    return createResultError(op, "ZITADEL_ORGANIZATION_ID is required to run end-to-end identity fixtures.")
  }

  return createResult({ databaseUrl, issuer, organizationExternalId, publicOrigin })
}
