import type { PageNameAuth } from "./pageNameAuth.js"

export type PageRouteAuth = keyof typeof pageRouteAuth

export const pageRouteAuth = {
  login: "/login",
} as const satisfies Record<PageNameAuth, string>
