const callbackEnvironmentNames = [
  "OIDC_AUTHWORKS_CALLBACK_URL",
  "OIDC_AUTHWORKS_REDIRECT_URI",
  "OIDC_CALLBACK_URL",
  "OIDC_REDIRECT_URI",
  "OIDC_ZITADEL_CALLBACK_URL",
  "OIDC_ZITADEL_REDIRECT_URI",
  "ZITADEL_CALLBACK_URL",
  "ZITADEL_REDIRECT_URI",
] as const

export function oidcCallbackPathResolve(environment: Readonly<Record<string, string | undefined>>): string | undefined {
  const configuredValues = callbackEnvironmentNames
    .map((name) => environment[name])
    .filter((value): value is string => value !== undefined)
  if (configuredValues.length === 0) return "/api/auth/callback"
  if (configuredValues.some((value) => value !== configuredValues[0])) return undefined

  const publicOrigin = publicOriginResolve(environment.PUBLIC_ORIGIN)
  if (publicOrigin === undefined) return undefined

  let callbackUrl: URL
  try {
    callbackUrl = new URL(configuredValues[0] ?? "")
  } catch (_error) {
    return undefined
  }

  if (
    callbackUrl.origin !== publicOrigin.origin ||
    callbackUrl.username !== "" ||
    callbackUrl.password !== "" ||
    callbackUrl.search !== "" ||
    callbackUrl.hash !== ""
  ) {
    return undefined
  }

  const callbackPath =
    callbackUrl.pathname.endsWith("/") && callbackUrl.pathname !== "/"
      ? callbackUrl.pathname.slice(0, -1)
      : callbackUrl.pathname
  if (callbackPath === "/" || callbackPath === "/login") return undefined
  return callbackUrl.pathname
}

function publicOriginResolve(value: string | undefined): URL | undefined {
  if (value === undefined) return undefined

  try {
    const origin = new URL(value)
    if (
      (origin.protocol !== "http:" && origin.protocol !== "https:") ||
      origin.username !== "" ||
      origin.password !== "" ||
      origin.pathname !== "/" ||
      origin.search !== "" ||
      origin.hash !== ""
    ) {
      return undefined
    }
    return origin
  } catch (_error) {
    return undefined
  }
}
