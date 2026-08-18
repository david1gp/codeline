import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type RuntimeConfiguration, runtimeConfigurationSchema } from "./runtimeConfigurationSchema.js"

export function runtimeConfigurationParse(input: unknown): Result<RuntimeConfiguration> {
  const op = "runtimeConfigurationParse"
  const normalizedInput = runtimeConfigurationInputNormalize(input)
  if (!normalizedInput.success) return normalizedInput

  const parsed = v.safeParse(runtimeConfigurationSchema, normalizedInput.data)

  if (!parsed.success) {
    const fields = parsed.issues
      .map((issue) => issue.path?.at(-1)?.key)
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

  const oidcFields = [
    ...(parsed.output.oidcIssuer === undefined ? ["OIDC_ISSUER"] : []),
    ...(parsed.output.oidcClientId === undefined ? ["OIDC_CLIENT_ID"] : []),
    ...(parsed.output.oidcOrganizationId === undefined ? ["ZITADEL_ORGANIZATION_ID"] : []),
  ]
  if (oidcFields.length > 0) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Invalid fields: ${oidcFields.join(", ")}.`,
    )
  }

  const oidcIssuerValue = parsed.output.oidcIssuer
  if (oidcIssuerValue === undefined) {
    return createResultError(op, "Runtime authentication configuration is invalid. Invalid fields: OIDC_ISSUER.")
  }
  const oidcIssuer = new URL(oidcIssuerValue)
  const secureFields = [
    ...(publicOrigin.protocol !== "https:" ? ["PUBLIC_ORIGIN"] : []),
    ...(!isSecureAuthenticationUrl(oidcIssuer) ? ["OIDC_ISSUER"] : []),
  ]
  if (secureFields.length > 0) {
    return createResultError(
      op,
      `Runtime authentication configuration is invalid. Invalid fields: ${secureFields.join(", ")}.`,
    )
  }

  const oidcCallback =
    parsed.output.oidcCallbackUrl === undefined
      ? new URL("/api/auth/callback", publicOrigin)
      : new URL(parsed.output.oidcCallbackUrl)
  if (!isSecureAuthenticationUrl(oidcCallback) || oidcCallback.origin !== publicOrigin.origin) {
    return createResultError(op, "Runtime authentication configuration is invalid. Invalid fields: OIDC_REDIRECT_URI.")
  }

  return createResult({
    ...parsed.output,
    oidcCallbackUrl: oidcCallback.toString(),
    oidcIssuer: oidcIssuerValue,
    publicOrigin: publicOrigin.toString(),
  })
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

  const fields = [
    { internal: "authMode", names: ["AUTH_MODE"] },
    { internal: "publicOrigin", names: ["PUBLIC_ORIGIN"] },
    { internal: "oidcIssuer", names: ["OIDC_ISSUER", "ZITADEL_ISSUER"] },
    { internal: "oidcClientId", names: ["OIDC_CLIENT_ID", "ZITADEL_CLIENT_ID"] },
    { internal: "oidcClientSecret", names: ["OIDC_CLIENT_SECRET", "ZITADEL_CLIENT_SECRET"] },
    { internal: "oidcCallbackUrl", names: ["OIDC_REDIRECT_URI", "ZITADEL_REDIRECT_URI"] },
    {
      internal: "oidcOrganizationId",
      names: [
        "OIDC_ORGANIZATION_ID",
        "OIDC_ALLOWED_ORGANIZATION_ID",
        "ZITADEL_ORGANIZATION_ID",
        "ZITADEL_ALLOWED_ORGANIZATION_ID",
      ],
    },
  ] as const

  for (const field of fields) {
    const values: Array<{ name: string; value: unknown }> = [
      { name: field.internal, value: input[field.internal] },
      ...field.names.map((name) => ({ name, value: input[name] })),
    ].filter((entry) => entry.value !== undefined)
    const first = values[0]

    if (first !== undefined && values.some((entry) => entry.value !== first.value)) {
      return createResultError(
        op,
        `Runtime authentication configuration is invalid. Conflicting values for ${values
          .map((entry) => entry.name)
          .join(" and ")}.`,
      )
    }

    if (first !== undefined) normalizedInput[field.internal] = first.value
    for (const name of field.names) delete normalizedInput[name]
  }

  return createResult(normalizedInput)
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
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
