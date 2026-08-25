import path from "node:path"
import { fileURLToPath } from "node:url"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { databasePath } from "../src/database/databasePath.js"
import { oidcEnvironmentConfigurationResolve } from "./oidcEnvironmentConfigurationResolve.js"

export type E2eLocalEnvironment = {
  databaseUrl: string
  issuer: string
  organizationExternalId: string
  publicOrigin: string
}

const managedPublicOrigin = "https://preview.codeline.work"

function environmentValueRead(name: string): string | undefined {
  const value = Bun.env[name]
  if (value === undefined || value.trim().length === 0) return undefined
  return value.trim()
}

function sqliteDatabasePathRead(databaseUrl: string): string | undefined {
  if (!databaseUrl.startsWith("file:")) return undefined

  try {
    const target = new URL(databaseUrl)
    if (
      target.protocol !== "file:" ||
      (target.hostname !== "" && target.hostname !== "localhost") ||
      target.username !== "" ||
      target.password !== "" ||
      target.search !== "" ||
      target.hash !== ""
    ) {
      return undefined
    }

    const pathPart = databaseUrl.slice("file:".length)
    if (pathPart.startsWith("/")) return fileURLToPath(target)
    return path.resolve(decodeURIComponent(pathPart))
  } catch (_error) {
    return undefined
  }
}

/**
 * Refuses every end-to-end setup or cleanup run that does not target the
 * repository-managed local SQLite database and preview origin. A staging or
 * production connection string can never be mutated by the synthetic identity
 * fixture.
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

  const configuredDatabasePath = sqliteDatabasePathRead(databaseUrl)
  if (configuredDatabasePath === undefined) {
    return createResultError(op, "DATABASE_URL is not a valid SQLite file URL.")
  }
  if (configuredDatabasePath !== path.resolve(databasePath)) {
    return createResultError(op, "DATABASE_URL does not address the repository-managed SQLite database path.")
  }

  const publicOrigin = environmentValueRead("PUBLIC_ORIGIN") ?? managedPublicOrigin
  if (publicOrigin !== managedPublicOrigin) {
    return createResultError(op, `End-to-end identity fixtures only run against ${managedPublicOrigin}.`)
  }

  const oidcEnvironment = oidcEnvironmentConfigurationResolve()
  if (!oidcEnvironment.success) return oidcEnvironment
  if (oidcEnvironment.data.issuer === undefined) {
    return createResultError(
      op,
      "An OIDC issuer is required to run end-to-end identity fixtures. Configure an explicit or legacy provider issuer.",
    )
  }

  return createResult({
    databaseUrl,
    issuer: oidcEnvironment.data.issuer,
    organizationExternalId: oidcEnvironment.data.organizationExternalId,
    publicOrigin,
  })
}
