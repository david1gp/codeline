import { createResult, createResultError, type Result } from "@adaptive-ds/result"

export function oidcIssuerCanonicalize(value: string): Result<string> {
  const op = "oidcIssuerCanonicalize"
  if (value !== value.trim() || Array.from(value).some((character) => character <= " ")) {
    return createResultError(op, "The OIDC issuer is invalid.")
  }

  let issuer: URL
  try {
    issuer = new URL(value)
  } catch (_error) {
    return createResultError(op, "The OIDC issuer is invalid.")
  }

  if (
    issuer.protocol !== "https:" ||
    issuer.username !== "" ||
    issuer.password !== "" ||
    issuer.search !== "" ||
    issuer.hash !== ""
  ) {
    return createResultError(op, "The OIDC issuer is invalid.")
  }

  return createResult(issuer.toString())
}
