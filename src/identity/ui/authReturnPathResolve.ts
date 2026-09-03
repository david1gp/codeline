import { appKnownRouteResolve } from "../../app/appKnownRouteResolve.js"
import { pageRouteDashboard } from "../../ui/dashboard_url/pageRouteDashboard.js"
import { pageRouteAuth } from "../auth_url/pageRouteAuth.js"

/**
 * Validates a browser-supplied return path before it is handed to the login
 * redirect. Only known same-origin application paths are preserved, and the
 * login route itself is rejected so a successful sign-in cannot loop.
 */
export function authReturnPathResolve(
  input: string | null | undefined,
  pathIsKnown: (pathname: string) => boolean = appKnownRouteResolve,
): string {
  const fallback = pageRouteDashboard.dashboard
  if (input === null || input === undefined || input === "") return fallback
  if (!input.startsWith("/") || input.startsWith("//")) return fallback
  if (input.includes("\\")) return fallback
  if (/%(?:2e|2f|5c)/i.test(input)) return fallback

  let target: URL
  try {
    target = new URL(input, "https://codeline.local")
  } catch (_error: unknown) {
    return fallback
  }

  if (target.pathname === pageRouteAuth.login || target.pathname.startsWith(`${pageRouteAuth.login}/`)) return fallback
  if (!pathIsKnown(target.pathname)) return fallback
  return `${target.pathname}${target.search}${target.hash}`
}
