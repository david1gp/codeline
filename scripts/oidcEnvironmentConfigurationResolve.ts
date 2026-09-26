import { createResult, createResultError, type Result } from "@adaptive-ds/result"

const issuerSources = [
  { names: ["OIDC_ZITADEL_ISSUER", "ZITADEL_ISSUER"], label: "Zitadel" },
  { names: ["OIDC_AUTHWORKS_ISSUER"], label: "Authworks" },
  { names: ["OIDC_ISSUER"], label: "provider-neutral OIDC" },
] as const

const localOrganizationNames = ["OIDC_ORGANIZATION_ID", "OIDC_ALLOWED_ORGANIZATION_ID"] as const
const providerOrganizationSources = [
  {
    names: ["OIDC_AUTHWORKS_ORGANIZATION_ID", "OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID"],
    label: "Authworks",
  },
  {
    names: [
      "OIDC_ZITADEL_ORGANIZATION_ID",
      "OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID",
      "ZITADEL_ORGANIZATION_ID",
      "ZITADEL_ALLOWED_ORGANIZATION_ID",
    ],
    label: "Zitadel",
  },
] as const

/**
 * Resolves the local organization and a stable issuer for repository-owned
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
  const localOrganizations = environmentValuesRead(environment, localOrganizationNames)
  if (
    localOrganizations.length > 1 &&
    localOrganizations.some((entry) => entry.value !== localOrganizations[0]?.value)
  ) {
    return createResultError(op, "Configured local OIDC organization aliases must use one shared value.")
  }

  const providerOrganizationValues: Array<{ name: string; value: string }> = []
  for (const source of providerOrganizationSources) {
    const values = environmentValuesRead(environment, source.names)
    if (values.length > 1 && values.some((entry) => entry.value !== values[0]?.value)) {
      return createResultError(op, `Conflicting ${source.label} organization aliases are configured.`)
    }
    const value = values[0]
    if (value !== undefined) providerOrganizationValues.push(value)
  }
  const localOrganization = localOrganizations[0]
  const organization = localOrganization ?? providerOrganizationValues[0]
  if (organization === undefined) {
    return createResultError(
      op,
      "An OIDC organization ID is required. Set OIDC_ORGANIZATION_ID or a provider organization ID.",
    )
  }
  if (
    localOrganization === undefined &&
    providerOrganizationValues.some((entry) => entry.value !== organization.value)
  ) {
    return createResultError(
      op,
      "Provider organization IDs differ. Set OIDC_ORGANIZATION_ID to the local Codeline organization external ID.",
    )
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

function environmentValuesRead(
  environment: Record<string, string | undefined>,
  names: readonly string[],
): Array<{ name: string; value: string }> {
  return names.flatMap((name) => {
    const value = environmentValueRead(environment, name)
    return value === undefined ? [] : [{ name, value }]
  })
}

function environmentValueRead(environment: Record<string, string | undefined>, name: string): string | undefined {
  const value = environment[name]
  if (value === undefined || value.trim().length === 0) return undefined
  return value.trim()
}
