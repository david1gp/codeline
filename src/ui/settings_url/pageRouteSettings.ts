import type { PageNameSettings } from "./pageNameSettings.js"

export type PageRouteSettings = keyof typeof pageRouteSettings

export const pageRouteSettings = {
  settings: "/settings",
} as const satisfies Record<PageNameSettings, string>
