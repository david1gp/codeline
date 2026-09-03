import type { PageNameDashboard } from "./pageNameDashboard.js"

export type PageRouteDashboard = keyof typeof pageRouteDashboard

export const pageRouteDashboard = {
  dashboard: "/",
} as const satisfies Record<PageNameDashboard, string>
