import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { oidcIssuerCanonicalize } from "../identity/oidc/oidcIssuerCanonicalize.js"
import type { OidcProviderConfiguration } from "./oidcProviderConfigurationSchema.js"
import { type RuntimeConfiguration, runtimeConfigurationSchema } from "./runtimeConfigurationSchema.js"

type OidcProviderName = "authworks" | "legacy" | "zitadel"
type OidcProviderField = keyof OidcProviderConfiguration
type OidcProviderFieldValue = { name: string; value: unknown }
type OidcProviderInput = Partial<Record<OidcProviderField, OidcProviderFieldValue>>
type OidcProviderInputs = Partial<Record<OidcProviderName, OidcProviderInput>>

const oidcProviderFields = ["callbackUrl", "clientId", "clientSecret", "issuer", "organizationId"] as const
const oidcProviderEnvironmentNames = {
  authworks: {
    callbackUrl: ["OIDC_AUTHWORKS_CALLBACK_URL", "OIDC_AUTHWORKS_REDIRECT_URI"],
    clientId: ["OIDC_AUTHWORKS_CLIENT_ID"],
    clientSecret: ["OIDC_AUTHWORKS_CLIENT_SECRET"],
    issuer: ["OIDC_AUTHWORKS_ISSUER"],
    organizationId: ["OIDC_AUTHWORKS_ORGANIZATION_ID", "OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID"],
  },
  zitadel: {
    callbackUrl: ["OIDC_ZITADEL_CALLBACK_URL", "OIDC_ZITADEL_REDIRECT_URI"],
    clientId: ["OIDC_ZITADEL_CLIENT_ID"],
    clientSecret: ["OIDC_ZITADEL_CLIENT_SECRET"],
    issuer: ["OIDC_ZITADEL_ISSUER"],
    organizationId: ["OIDC_ZITADEL_ORGANIZATION_ID", "OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID"],
  },
} as const satisfies Record<Exclude<OidcProviderName, "legacy">, Record<OidcProviderField, readonly string[]>>
const oidcLegacyEnvironmentNames = {
  generic: {
    callbackUrl: ["OIDC_CALLBACK_URL", "OIDC_REDIRECT_URI"],
    clientId: ["OIDC_CLIENT_ID"],
    clientSecret: ["OIDC_CLIENT_SECRET"],
    issuer: ["OIDC_ISSUER"],
    organizationId: ["OIDC_ORGANIZATION_ID", "OIDC_ALLOWED_ORGANIZATION_ID"],
  },
  zitadel: {
    callbackUrl: ["ZITADEL_CALLBACK_URL", "ZITADEL_REDIRECT_URI"],
    clientId: ["ZITADEL_CLIENT_ID"],
    clientSecret: ["ZITADEL_CLIENT_SECRET"],
    issuer: ["ZITADEL_ISSUER"],
    organizationId: ["ZITADEL_ORGANIZATION_ID", "ZITADEL_ALLOWED_ORGANIZATION_ID"],
  },
} as const satisfies Record<"generic" | "zitadel", Record<OidcProviderField, readonly string[]>>
const oidcOrganizationEnvironmentNames = [
  ...oidcProviderEnvironmentNames.authworks.organizationId,
  ...oidcProviderEnvironmentNames.zitadel.organizationId,
  ...oidcLegacyEnvironmentNames.generic.organizationId,
  ...oidcLegacyEnvironmentNames.zitadel.organizationId,
] as const
const oidcLocalOrganizationEnvironmentNames = ["OIDC_ORGANIZATION_ID", "OIDC_ALLOWED_ORGANIZATION_ID"] as const

export function runtimeConfigurationParse(input: unknown): Result<RuntimeConfiguration> {
  const op = "runtimeConfigurationParse"
  const normalizedInput = runtimeConfigurationInputNormalize(input)
  if (!normalizedInput.success) return normalizedInput

  const parsed = v.safeParse(runtimeConfigurationSchema, normalizedInput.data)

  if (!parsed.success) {
    const fields = parsed.issues
      .map((issue) => {
        const field = issue.path?.at(-1)?.key
        if (typeof field !== "string") return undefined
        const provider = issue.path?.at(-2)?.key
        if (isOidcProviderName(provider) && isOidcProviderField(field))
          return oidcProviderFieldName(provider, field, input)
        const configurationField = oidcConfigurationFieldResolve(field)
        if (configurationField !== undefined) return oidcConfigurationFieldName(configurationField, input)
        return field
      })
      .filter((field): field is string => typeof field === "string")
    const uniqueFields = [...new Set(fields)]
    const suffix = uniqueFields.length > 0 ? ` Invalid fields: ${uniqueFields.join(", ")}.` : ""
    return createResultError(op, `Runtime configuration is invalid.${suffix}`)
  }

  if (parsed.output.nodeEnv === "development" && parsed.output.developmentIdentity === undefined) {
    return createResultError(op, "Runtime configuration is invalid. Invalid fields: developmentIdentity.")
  }

  const authenticationFields = [
    ...(parsed.output.authMode === undefined ? ["AUTH_MODE"] : []),
    ...(parsed.output.publicOrigin === undefined ? ["PUBLIC_ORIGIN"] : []),
  ]
  if (authenticationFields.length > 0) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Invalid fields: ${authenticationFields.join(", ")}.`,
    )
  }

  const publicOriginValue = parsed.output.publicOrigin
  if (publicOriginValue === undefined) {
    return createResultError(op, "Runtime authentication configuration is invalid. Invalid fields: PUBLIC_ORIGIN.")
  }
  const publicOrigin = new URL(publicOriginValue)
  if (!isPublicOrigin(publicOrigin)) {
    return createResultError(op, "Runtime authentication configuration is invalid. Invalid fields: PUBLIC_ORIGIN.")
  }

  if (parsed.output.authMode === "development") {
    if (parsed.output.nodeEnv === "production") {
      return createResultError(op, "Runtime authentication configuration is invalid. Invalid fields: AUTH_MODE.")
    }
    return createResult({ ...parsed.output, oidcCallbackUrl: undefined, publicOrigin: publicOrigin.toString() })
  }

  const providerEntries = oidcProviderEntries(parsed.output.oidcProviders)
  const requiredFields = providerEntries.flatMap(([provider, configuration]) =>
    oidcProviderRequiredFields(provider, configuration, input),
  )
  if (providerEntries.length === 0) {
    requiredFields.push("OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_ORGANIZATION_ID")
  }
  if (requiredFields.length > 0) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Invalid fields: ${requiredFields.join(", ")}.`,
    )
  }

  const issuerFields = providerEntries.flatMap(([provider, configuration]) => {
    const issuer = configuration.issuer
    if (issuer === undefined || isSecureAuthenticationUrl(new URL(issuer))) return []
    return [oidcProviderFieldName(provider, "issuer", input)]
  })
  const secureFields = [...(publicOrigin.protocol !== "https:" ? ["PUBLIC_ORIGIN"] : []), ...issuerFields]
  if (secureFields.length > 0) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Invalid fields: ${secureFields.join(", ")}.`,
    )
  }

  const issuerCollision = oidcProviderIssuerCollisionResolve(providerEntries, input)
  if (!issuerCollision.success) return issuerCollision

  const organizationResult = oidcOrganizationResolve(providerEntries, input)
  if (!organizationResult.success) return organizationResult

  const callbackResult = oidcCallbackResolve(parsed.output, providerEntries, publicOrigin, input)
  if (!callbackResult.success) return callbackResult

  const oidcProviders = Object.fromEntries(
    providerEntries.map(([provider, configuration]) => [
      provider,
      { ...configuration, callbackUrl: callbackResult.data },
    ]),
  ) as RuntimeConfiguration["oidcProviders"]
  const normalizedConfiguration = {
    ...parsed.output,
    oidcCallbackUrl: callbackResult.data,
    oidcOrganizationId: organizationResult.data,
    oidcProviders,
    publicOrigin: publicOrigin.toString(),
  }
  if (providerEntries.length > 1) {
    delete normalizedConfiguration.oidcClientId
    delete normalizedConfiguration.oidcClientSecret
    delete normalizedConfiguration.oidcIssuer
  }

  return createResult(normalizedConfiguration)
}

function runtimeConfigurationInputNormalize(input: unknown): Result<unknown> {
  const op = "runtimeConfigurationParse"
  if (!isRecord(input)) return createResult(input)

  const normalizedInput = { ...input }
  const sessionsSidebarPageSize = input.SESSIONS_SIDEBAR_PAGE_SIZE
  if (sessionsSidebarPageSize !== undefined) {
    const normalizedPageSize =
      typeof sessionsSidebarPageSize === "string" ? Number(sessionsSidebarPageSize) : sessionsSidebarPageSize
    if (input.sessionsSidebarPageSize !== undefined && input.sessionsSidebarPageSize !== normalizedPageSize) {
      return createResultError(
        op,
        "Runtime configuration is invalid. Conflicting values for sessionsSidebarPageSize and SESSIONS_SIDEBAR_PAGE_SIZE.",
      )
    }
    normalizedInput.sessionsSidebarPageSize = normalizedPageSize
  }
  delete normalizedInput.SESSIONS_SIDEBAR_PAGE_SIZE

  for (const field of [
    { internal: "authMode", name: "AUTH_MODE" },
    { internal: "publicOrigin", name: "PUBLIC_ORIGIN" },
  ]) {
    const internalValue = input[field.internal]
    const environmentValue = input[field.name]
    if (internalValue !== undefined && environmentValue !== undefined && internalValue !== environmentValue) {
      return createResultError(
        op,
        `Runtime authentication configuration is invalid. Conflicting values for ${field.internal} and ${field.name}.`,
      )
    }
    if (internalValue === undefined && environmentValue !== undefined)
      normalizedInput[field.internal] = environmentValue
    delete normalizedInput[field.name]
  }

  const providersResult = runtimeConfigurationProvidersNormalize(input)
  if (!providersResult.success) return providersResult
  if (normalizedInput.authMode === "development") {
    const organizationResult = runtimeConfigurationDevelopmentOrganizationResolve(input)
    if (!organizationResult.success) return organizationResult
    if (organizationResult.data !== undefined) normalizedInput.oidcOrganizationId = organizationResult.data
  }
  for (const name of runtimeConfigurationEnvironmentNames()) delete normalizedInput[name]

  if (providersResult.data !== undefined) {
    normalizedInput.oidcProviders = runtimeConfigurationProvidersToInput(providersResult.data)
    runtimeConfigurationLegacyFieldsProject(normalizedInput, providersResult.data)
  }

  return createResult(normalizedInput)
}

function runtimeConfigurationDevelopmentOrganizationResolve(input: Record<string, unknown>): Result<unknown> {
  const op = "runtimeConfigurationParse"
  const localValues = [
    { name: "oidcOrganizationId", value: input.oidcOrganizationId },
    ...oidcLocalOrganizationEnvironmentNames.map((name) => ({ name, value: input[name] })),
  ].filter((entry): entry is { name: string; value: unknown } => entry.value !== undefined)
  const providerValues: Array<{ name: string; value: unknown }> = []
  for (const name of oidcOrganizationEnvironmentNames) {
    if (oidcLocalOrganizationEnvironmentNames.includes(name as (typeof oidcLocalOrganizationEnvironmentNames)[number]))
      continue
    const value = input[name]
    if (value !== undefined) providerValues.push({ name, value })
  }
  for (const provider of ["authworks", "legacy", "zitadel"] as const) {
    const providers =
      isRecord(input.oidcProviders) && isRecord(input.oidcProviders[provider])
        ? input.oidcProviders[provider]
        : undefined
    const value = providers?.organizationId
    if (value !== undefined) providerValues.push({ name: `oidcProviders.${provider}.organizationId`, value })
  }
  const values = localValues.length > 0 ? localValues : providerValues
  const first = values[0]
  if (first === undefined) return createResult(undefined)
  if (values.some((entry) => entry.value !== first.value)) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Conflicting values for ${values
        .map((entry) => entry.name)
        .join(" and ")}.`,
    )
  }
  return createResult(first.value)
}

function runtimeConfigurationProvidersNormalize(
  input: Record<string, unknown>,
): Result<OidcProviderInputs | undefined> {
  const genericResult = oidcProviderInputRead(input, "generic", oidcLegacyEnvironmentNames.generic)
  if (!genericResult.success) return genericResult
  const legacyZitadelResult = oidcProviderInputRead(input, "legacyZitadel", oidcLegacyEnvironmentNames.zitadel)
  if (!legacyZitadelResult.success) return legacyZitadelResult
  const explicitAuthworksResult = oidcProviderInputRead(input, "authworks", oidcProviderEnvironmentNames.authworks)
  if (!explicitAuthworksResult.success) return explicitAuthworksResult
  const explicitZitadelResult = oidcProviderInputRead(input, "zitadel", oidcProviderEnvironmentNames.zitadel)
  if (!explicitZitadelResult.success) return explicitZitadelResult

  const generic = oidcProviderInputHasValues(genericResult.data) ? genericResult.data : undefined
  const legacyZitadel = oidcProviderInputHasValues(legacyZitadelResult.data) ? legacyZitadelResult.data : undefined
  const explicitAuthworks = oidcProviderInputHasValues(explicitAuthworksResult.data)
    ? explicitAuthworksResult.data
    : undefined
  const explicitZitadel = oidcProviderInputHasValues(explicitZitadelResult.data)
    ? explicitZitadelResult.data
    : undefined

  let authworks = explicitAuthworks
  let legacy: OidcProviderInput | undefined
  let zitadel = explicitZitadel
  if (explicitAuthworks !== undefined) {
    if (generic !== undefined) {
      const merged = oidcProviderInputMerge(explicitAuthworks, oidcProviderInputWithoutOrganization(generic))
      if (!merged.success) return merged
      authworks = merged.data
    }
  } else if (
    generic !== undefined &&
    oidcProviderInputHasIdentityValues(generic) &&
    (explicitZitadel !== undefined || legacyZitadel === undefined)
  ) {
    if (explicitZitadel !== undefined) authworks = generic
    else legacy = generic
  }

  if (explicitZitadel !== undefined) {
    if (legacyZitadel !== undefined) {
      const merged = oidcProviderInputMerge(explicitZitadel, legacyZitadel)
      if (!merged.success) return merged
      zitadel = merged.data
    }
  } else if (legacyZitadel !== undefined) {
    if (generic !== undefined && explicitAuthworks === undefined && explicitZitadel === undefined) {
      const merged = oidcProviderInputMerge(oidcProviderInputWithoutOrganization(generic), legacyZitadel)
      if (!merged.success) return merged
      zitadel = merged.data
      authworks = undefined
    } else {
      zitadel = legacyZitadel
    }
  }

  const genericShared = generic === undefined ? undefined : oidcProviderInputSharedFields(generic)
  if (genericShared !== undefined) {
    for (const provider of ["authworks", "zitadel"] as const) {
      const current = provider === "authworks" ? authworks : zitadel
      if (current === undefined) continue
      const merged = oidcProviderInputMerge(current, genericShared)
      if (!merged.success) return merged
      if (provider === "authworks") authworks = merged.data
      else zitadel = merged.data
    }
  }
  oidcProviderInputSharedOrganizationApply(authworks, zitadel, generic)

  if (authworks === undefined && legacy === undefined && zitadel === undefined && !isRecord(input.oidcProviders))
    return createResult(undefined)
  return createResult({
    ...(authworks === undefined ? {} : { authworks }),
    ...(legacy === undefined ? {} : { legacy }),
    ...(zitadel === undefined ? {} : { zitadel }),
  })
}

function oidcProviderInputRead(
  input: Record<string, unknown>,
  source: "generic" | "legacyZitadel" | OidcProviderName,
  environmentNames: Record<OidcProviderField, readonly string[]>,
): Result<OidcProviderInput> {
  const op = "runtimeConfigurationParse"
  const nestedProviderName = source === "generic" ? "legacy" : source
  const nestedProviderValue =
    source === "legacyZitadel" || !isRecord(input.oidcProviders) ? undefined : input.oidcProviders[nestedProviderName]
  const nestedProvider = isRecord(nestedProviderValue) ? nestedProviderValue : undefined
  const providerInput: OidcProviderInput = {}

  for (const field of oidcProviderFields) {
    const values: OidcProviderFieldValue[] = []
    if (nestedProvider !== undefined && nestedProvider[field] !== undefined) {
      values.push({ name: `oidcProviders.${nestedProviderName}.${field}`, value: nestedProvider[field] })
    }
    if (source === "generic" && input[legacyInternalFieldName(field)] !== undefined) {
      values.push({ name: legacyInternalFieldName(field), value: input[legacyInternalFieldName(field)] })
    }
    for (const name of environmentNames[field]) {
      if (input[name] !== undefined) values.push({ name, value: input[name] })
    }
    const first = values[0]
    if (first === undefined) continue
    if (values.some((entry) => entry.value !== first.value)) {
      return createResultError(
        op,
        `Runtime authentication configuration is invalid. Conflicting values for ${values
          .map((entry) => entry.name)
          .join(" and ")}.`,
      )
    }
    providerInput[field] = { name: values.map((entry) => entry.name).join(" and "), value: first.value }
  }

  return createResult(providerInput)
}

function oidcProviderInputMerge(left: OidcProviderInput, right: OidcProviderInput): Result<OidcProviderInput> {
  const op = "runtimeConfigurationParse"
  const merged: OidcProviderInput = { ...left }
  for (const field of oidcProviderFields) {
    const leftValue = left[field]
    const rightValue = right[field]
    if (leftValue === undefined) {
      if (rightValue !== undefined) merged[field] = rightValue
      continue
    }
    if (rightValue === undefined) continue
    if (leftValue.value !== rightValue.value) {
      return createResultError(
        op,
        `Runtime authentication configuration is invalid. Conflicting values for ${leftValue.name} and ${rightValue.name}.`,
      )
    }
  }
  return createResult(merged)
}

function oidcProviderInputHasValues(input: OidcProviderInput): boolean {
  return oidcProviderFields.some((field) => input[field] !== undefined)
}

function oidcProviderInputHasIdentityValues(input: OidcProviderInput): boolean {
  return ["clientId", "clientSecret", "issuer"].some((field) => input[field as OidcProviderField] !== undefined)
}

function oidcProviderInputSharedFields(input: OidcProviderInput): OidcProviderInput {
  return {
    ...(input.callbackUrl === undefined ? {} : { callbackUrl: input.callbackUrl }),
  }
}

function oidcProviderInputWithoutOrganization(input: OidcProviderInput): OidcProviderInput {
  const result = { ...input }
  delete result.organizationId
  return result
}

function oidcProviderInputSharedOrganizationApply(
  authworks: OidcProviderInput | undefined,
  zitadel: OidcProviderInput | undefined,
  generic: OidcProviderInput | undefined,
): void {
  const organization = generic?.organizationId ?? authworks?.organizationId ?? zitadel?.organizationId
  if (organization === undefined) return
  if (authworks !== undefined && authworks.organizationId === undefined) authworks.organizationId = organization
  if (zitadel !== undefined && zitadel.organizationId === undefined) zitadel.organizationId = organization
}

function runtimeConfigurationProvidersToInput(inputs: OidcProviderInputs): Record<string, Record<string, unknown>> {
  const providers: Record<string, Record<string, unknown>> = {}
  for (const provider of ["authworks", "legacy", "zitadel"] as const) {
    const input = inputs[provider]
    if (input === undefined) continue
    providers[provider] = Object.fromEntries(
      oidcProviderFields.flatMap((field) => {
        const value = input[field]
        return value === undefined ? [] : [[field, value.value]]
      }),
    )
  }
  return providers
}

function runtimeConfigurationLegacyFieldsProject(input: Record<string, unknown>, providers: OidcProviderInputs): void {
  const entries = oidcProviderInputEntries(providers)
  if (entries.length === 0) return

  const callback = entries.map(([, provider]) => provider.callbackUrl).find((value) => value !== undefined)
  if (callback !== undefined) input.oidcCallbackUrl = callback.value

  if (entries.length > 1) {
    delete input.oidcIssuer
    delete input.oidcClientId
    delete input.oidcClientSecret
    return
  }

  const provider = entries[0]?.[1]
  if (provider === undefined) return
  for (const [field, legacyField] of [
    ["issuer", "oidcIssuer"],
    ["clientId", "oidcClientId"],
    ["clientSecret", "oidcClientSecret"],
    ["organizationId", "oidcOrganizationId"],
  ] as const) {
    const value = provider[field]
    if (value === undefined) continue
    input[legacyField] = value.value
  }
}

function oidcProviderEntries(
  providers: RuntimeConfiguration["oidcProviders"],
): Array<[OidcProviderName, OidcProviderConfiguration]> {
  if (providers === undefined) return []
  return (
    [
      ["authworks", providers.authworks],
      ["legacy", providers.legacy],
      ["zitadel", providers.zitadel],
    ] as const
  ).flatMap(([provider, configuration]) =>
    configuration === undefined ? [] : [[provider, configuration] as [OidcProviderName, OidcProviderConfiguration]],
  )
}

function oidcProviderRequiredFields(
  provider: OidcProviderName,
  configuration: OidcProviderConfiguration,
  input: unknown,
): string[] {
  return [
    ...(configuration.issuer === undefined ? [oidcProviderFieldName(provider, "issuer", input)] : []),
    ...(configuration.clientId === undefined ? [oidcProviderFieldName(provider, "clientId", input)] : []),
    ...(configuration.organizationId === undefined ? [oidcProviderFieldName(provider, "organizationId", input)] : []),
  ]
}

function oidcProviderIssuerCollisionResolve(
  entries: Array<[OidcProviderName, OidcProviderConfiguration]>,
  input: unknown,
): Result<void> {
  const op = "runtimeConfigurationParse"
  const issuerFields = new Map<string, string>()
  for (const [provider, configuration] of entries) {
    const issuer = configuration.issuer
    if (issuer === undefined) continue
    const issuerField = oidcProviderFieldName(provider, "issuer", input)
    const normalizedIssuer = oidcIssuerCanonicalize(issuer)
    if (!normalizedIssuer.success) {
      return createResultError(op, `Runtime authentication configuration is invalid. Invalid fields: ${issuerField}.`)
    }
    const previousIssuerField = issuerFields.get(normalizedIssuer.data)
    if (previousIssuerField !== undefined) {
      return createResultError(
        op,
        `Runtime authentication configuration is invalid. Conflicting normalized issuer fields: ${previousIssuerField} and ${issuerField}.`,
      )
    }
    issuerFields.set(normalizedIssuer.data, issuerField)
  }
  return createResult(undefined)
}

function oidcProviderFieldName(provider: OidcProviderName, field: OidcProviderField, input: unknown): string {
  const names = oidcProviderFieldNames(provider, field, input)
  const configuredNames = names.filter((name) => oidcProviderFieldInputHasValue(provider, field, name, input))
  return (configuredNames.length > 0 ? configuredNames : names).join(" and ")
}

function oidcProviderFieldNames(provider: OidcProviderName, field: OidcProviderField, input: unknown): string[] {
  const environmentNames =
    field === "callbackUrl"
      ? [
          ...oidcLegacyEnvironmentNames.generic.callbackUrl,
          ...oidcLegacyEnvironmentNames.zitadel.callbackUrl,
          ...oidcProviderEnvironmentNames.authworks.callbackUrl,
          ...oidcProviderEnvironmentNames.zitadel.callbackUrl,
        ]
      : providerEnvironmentNamesResolve(provider, input)[field]
  const names = [
    ...(isRecord(input) && isRecord(input.oidcProviders) && isRecord(input.oidcProviders[provider])
      ? [`oidcProviders.${provider}.${field}`]
      : []),
    ...environmentNames,
  ]
  return [...new Set(names)]
}

function providerEnvironmentNamesResolve(
  provider: OidcProviderName,
  input: unknown,
): Record<OidcProviderField, readonly string[]> {
  if (provider !== "legacy" && providerInputUsesExplicitNamespace(provider, input))
    return oidcProviderEnvironmentNames[provider]
  if (provider === "zitadel") return oidcLegacyEnvironmentNames.zitadel
  return oidcLegacyEnvironmentNames.generic
}

function oidcConfigurationFieldName(field: OidcProviderField, input: unknown): string {
  const providerNames = (["authworks", "legacy", "zitadel"] as const).flatMap((provider) =>
    oidcProviderFieldNames(provider, field, input).map((name) => ({ name, provider })),
  )
  const configuredNames = providerNames
    .filter(({ name, provider }) => oidcProviderFieldInputHasValue(provider, field, name, input))
    .map(({ name }) => name)
  if (configuredNames.length > 0) return [...new Set(configuredNames)].join(" and ")
  return field === "callbackUrl" ? "OIDC_CALLBACK_URL" : field
}

function oidcProviderFieldInputHasValue(
  provider: OidcProviderName,
  field: OidcProviderField,
  name: string,
  input: unknown,
): boolean {
  if (!isRecord(input)) return false
  if (name === `oidcProviders.${provider}.${field}`)
    return (
      isRecord(input.oidcProviders) &&
      isRecord(input.oidcProviders[provider]) &&
      input.oidcProviders[provider][field] !== undefined
    )
  return input[name] !== undefined
}

function oidcConfigurationFieldResolve(value: string): OidcProviderField | undefined {
  if (isOidcProviderField(value)) return value
  const internalFieldNames: Record<string, OidcProviderField> = {
    oidcCallbackUrl: "callbackUrl",
    oidcClientId: "clientId",
    oidcClientSecret: "clientSecret",
    oidcIssuer: "issuer",
    oidcOrganizationId: "organizationId",
  }
  return internalFieldNames[value]
}

function providerInputUsesExplicitNamespace(provider: OidcProviderName, input: unknown): boolean {
  if (!isRecord(input)) return false
  if (provider === "legacy") return false
  if (isRecord(input.oidcProviders) && isRecord(input.oidcProviders[provider])) return true
  return oidcProviderFields.some((field) =>
    oidcProviderEnvironmentNames[provider][field].some((name) => input[name] !== undefined),
  )
}

function oidcOrganizationResolve(
  entries: Array<[OidcProviderName, OidcProviderConfiguration]>,
  input: unknown,
): Result<string> {
  const op = "runtimeConfigurationParse"
  const localInputValues = [
    {
      name: "oidcOrganizationId",
      value: isRecord(input) ? input.oidcOrganizationId : undefined,
    },
    ...oidcLocalOrganizationEnvironmentNames.map((name) => ({
      name,
      value: isRecord(input) ? input[name] : undefined,
    })),
  ].filter((entry) => entry.value !== undefined)
  const invalidLocalValues = localInputValues.filter(
    (entry) => typeof entry.value !== "string" || entry.value.trim().length === 0,
  )
  if (invalidLocalValues.length > 0) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Invalid fields: ${invalidLocalValues
        .map((entry) => entry.name)
        .join(" and ")}.`,
    )
  }
  const localValues = localInputValues as Array<{ name: string; value: string }>
  const local = localValues[0]
  if (localValues.some((entry) => entry.value !== local?.value)) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Conflicting values for ${localValues
        .map((entry) => entry.name)
        .join(" and ")}.`,
    )
  }
  if (local !== undefined) return createResult(local.value)

  const values = entries
    .map(([provider, configuration]) => ({
      name: oidcProviderFieldName(provider, "organizationId", input),
      value: configuration.organizationId,
    }))
    .filter((entry): entry is { name: string; value: string } => entry.value !== undefined)
  const first = values[0]
  if (first === undefined) return createResultError(op, "Runtime authentication configuration is invalid.")
  if (values.some((entry) => entry.value !== first.value)) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Invalid fields: ${values
        .map((entry) => entry.name)
        .join(
          " and ",
        )}. Configure one local Codeline organization external ID with OIDC_ORGANIZATION_ID when provider organization IDs differ.`,
    )
  }
  return createResult(first.value)
}

function oidcCallbackResolve(
  configuration: v.InferOutput<typeof runtimeConfigurationSchema>,
  entries: Array<[OidcProviderName, OidcProviderConfiguration]>,
  publicOrigin: URL,
  input: unknown,
): Result<string> {
  const op = "runtimeConfigurationParse"
  const values = [
    ...(configuration.oidcCallbackUrl === undefined || !oidcCallbackInputUsesInternalField(input)
      ? []
      : [{ name: "oidcCallbackUrl", value: configuration.oidcCallbackUrl }]),
    ...entries.flatMap(([provider, providerConfiguration]) =>
      providerConfiguration.callbackUrl === undefined
        ? []
        : [{ name: oidcProviderFieldName(provider, "callbackUrl", input), value: providerConfiguration.callbackUrl }],
    ),
  ]
  const first = values[0]
  if (first !== undefined && values.some((entry) => entry.value !== first.value)) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Conflicting values for ${values
        .map((entry) => entry.name)
        .join(" and ")}.`,
    )
  }

  const callback = first === undefined ? new URL("/api/auth/callback", publicOrigin) : new URL(first.value)
  if (!isSecureAuthenticationUrl(callback) || callback.origin !== publicOrigin.origin) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Invalid fields: ${first?.name ?? oidcConfigurationFieldName("callbackUrl", input)}.`,
    )
  }
  return createResult(callback.toString())
}

function oidcCallbackInputUsesInternalField(input: unknown): boolean {
  return isRecord(input) && input.oidcCallbackUrl !== undefined
}

function legacyInternalFieldName(field: OidcProviderField): string {
  return `oidc${field[0]?.toUpperCase() ?? ""}${field.slice(1)}`
}

function runtimeConfigurationEnvironmentNames(): readonly string[] {
  return [
    ...new Set([
      ...Object.values(oidcLegacyEnvironmentNames).flatMap((fields) => Object.values(fields).flat()),
      ...Object.values(oidcProviderEnvironmentNames).flatMap((fields) => Object.values(fields).flat()),
    ]),
  ]
}

function oidcProviderInputEntries(providers: OidcProviderInputs): Array<[OidcProviderName, OidcProviderInput]> {
  return (
    [
      ["authworks", providers.authworks],
      ["legacy", providers.legacy],
      ["zitadel", providers.zitadel],
    ] as const
  ).flatMap(([provider, configuration]) =>
    configuration === undefined ? [] : [[provider, configuration] as [OidcProviderName, OidcProviderInput]],
  )
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

function isOidcProviderName(value: unknown): value is OidcProviderName {
  return value === "authworks" || value === "legacy" || value === "zitadel"
}

function isOidcProviderField(value: unknown): value is OidcProviderField {
  return typeof value === "string" && oidcProviderFields.includes(value as OidcProviderField)
}

function isPublicOrigin(url: URL): boolean {
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  )
}

function isSecureAuthenticationUrl(url: URL): boolean {
  return url.protocol === "https:" && url.username === "" && url.password === "" && url.search === "" && url.hash === ""
}
