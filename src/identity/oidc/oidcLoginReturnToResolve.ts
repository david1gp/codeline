import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { pageRouteDashboard } from "../../ui/dashboard_url/pageRouteDashboard.js"
import { pageRouteAuth } from "../auth_url/pageRouteAuth.js"

export function oidcLoginReturnToResolve(
  input: string | undefined,
  publicOriginValue: string,
  pathIsKnown: (pathname: string) => boolean,
): Result<string> {
  const op = "oidcLoginReturnToResolve"
  const returnTo = input ?? pageRouteDashboard.dashboard
  if (returnTo === "" || returnTo.includes("\\") || /%(?:2e|2f|5c)/i.test(returnTo)) {
    return createResultError(op, "The login return path is invalid.")
  }

  let publicOrigin: URL
  let target: URL
  try {
    publicOrigin = new URL(publicOriginValue)
    target = new URL(returnTo, publicOrigin)
  } catch (_error) {
    return createResultError(op, "The login return path is invalid.")
  }

  const relativePath = returnTo.startsWith("/") && !returnTo.startsWith("//")
  const absoluteSameOrigin = returnTo.startsWith(`${publicOrigin.origin}/`) || returnTo === publicOrigin.origin
  if (
    (!relativePath && !absoluteSameOrigin) ||
    target.origin !== publicOrigin.origin ||
    target.username !== "" ||
    target.password !== "" ||
    target.pathname === pageRouteAuth.login ||
    target.pathname.startsWith(`${pageRouteAuth.login}/`) ||
    !pathIsKnown(target.pathname)
  ) {
    return createResultError(op, "The login return path is invalid.")
  }

  return createResult(`${target.pathname}${target.search}${target.hash}`)
}
