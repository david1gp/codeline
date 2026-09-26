import type { PageNameFiles } from "./pageNameFiles.js"

export type PageRouteFiles = keyof typeof pageRouteFiles

export const pageRouteFiles = {
  files: "/explorer",
} as const satisfies Record<PageNameFiles, string>
