import { identitySessionCookieName } from "../api/identitySessionCookieName.js"

export function identitySessionTokenRead(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie")
  if (cookieHeader === null) return undefined

  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=")
    if (separator < 0) continue
    const name = cookie.slice(0, separator).trim()
    if (name !== identitySessionCookieName) continue
    const value = cookie.slice(separator + 1).trim()
    if (value.length === 0) return undefined
    try {
      return decodeURIComponent(value)
    } catch (_error) {
      return undefined
    }
  }
  return undefined
}
