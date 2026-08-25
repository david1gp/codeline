import { createResult, createResultError, type Result } from "@adaptive-ds/result"

const issuerSources = [
  { names: ["OIDC_ZITADEL_ISSUER", "ZITADEL_ISSUER"], label: "Zitadel" },
  { names: ["OIDC_AUTHWORKS_ISSUER"], label: "Authworks" },
  { names: ["OIDC_ISSUER"], label: "provider-neutral OIDC" },
] as const

const organizationNames = [
  "OIDC_AUTHWORKS_ORGANIZATION_ID",
  "OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID",
  "OIDC_ZITADEL_ORGANIZATION_ID",
  "OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID",
  "OIDC_ORGANIZATION_ID",
  "OIDC_ALLOWED_ORGANIZATION_ID",
  "ZITADEL_ORGANIZATION_ID",
  "ZITADEL_ALLOWED_ORGANIZATION_ID",
] as const

/**
 * Resolves the shared organization and a stable issuer for repository-owned
 * seed and identity-fixture commands without exposing environment values.
 * Zitadel is preferred when both providers are configured for deterministic
 * fixture ownership; the runtime still authorizes sessions through either
 * configured issuer.
 */
export function oidcEnvironmentConfigurationResolve(environment: Record<string, string | undefined> = Bun.env): Result<{
  issuer: string | undefined
  organizationExternalId: string
}> {
  const op = "oidcEnvironmentConfigurationResolve"
  const organizations = organizationNames.flatMap((name) => {
    const value = environmentValueRead(environment, name)
    return value === undefined ? [] : [{ name, value }]
  })
  const organization = organizations[0]
  if (organization === undefined) {
    return createResultError(
      op,
      "An OIDC organization ID is required. Set OIDC_AUTHWORKS_ORGANIZATION_ID, OIDC_ZITADEL_ORGANIZATION_ID, OIDC_ORGANIZATION_ID, or ZITADEL_ORGANIZATION_ID.",
    )
  }
  if (organizations.some((entry) => entry.value !== organization.value)) {
    return createResultError(op, "Configured OIDC organization IDs must use one shared value.")
  }

  for (const source of issuerSources) {
    const issuers = source.names.flatMap((name) => {
      const value = environmentValueRead(environment, name)
      return value === undefined ? [] : [{ name, value }]
    })
    const issuer = issuers[0]
    if (issuer === undefined) continue
    if (issuers.some((entry) => entry.value !== issuer.value)) {
      return createResultError(op, `Conflicting ${source.label} issuer aliases are configured.`)
    }
    return createResult({ issuer: issuer.value, organizationExternalId: organization.value })
  }

  return createResult({ issuer: undefined, organizationExternalId: organization.value })
}

function environmentValueRead(environment: Record<string, string | undefined>, name: string): string | undefined {
  const value = environment[name]
  if (value === undefined || value.trim().length === 0) return undefined
  return value.trim()
}
