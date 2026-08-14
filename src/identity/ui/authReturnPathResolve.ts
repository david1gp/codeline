import { appKnownRouteResolve } from "../../app/appKnownRouteResolve.js"

/**
 * Validates a browser-supplied return path before it is handed to the login
 * redirect. Only known same-origin application paths are preserved, and the
 * login route itself is rejected so a successful sign-in cannot loop.
 */
export function authReturnPathResolve(
  input: string | null | undefined,
  pathIsKnown: (pathname: string) => boolean = appKnownRouteResolve,
): string {
  const fallback = "/"
  if (input === null || input === undefined || input === "") return fallback
  if (!input.startsWith("/") || input.startsWith("//")) return fallback
  if (input.includes("\\") || input.includes("?") || input.includes("#")) return fallback
  if (/%(?:2e|2f|5c)/i.test(input)) return fallback
  if (input === "/login" || input.startsWith("/login/")) return fallback
  if (!pathIsKnown(input)) return fallback
  return input
}
