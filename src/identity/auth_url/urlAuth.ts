import { pageRouteAuth } from "./pageRouteAuth.js"

export function urlAuthLogin(returnTo?: string): string {
  if (!returnTo) return pageRouteAuth.login
  return `${pageRouteAuth.login}?returnTo=${encodeURIComponent(returnTo)}`
}
