import type { PageNameDemo } from "./pageNameDemo.js"

export type PageRouteDemo = keyof typeof pageRouteDemo

export const pageRouteDemo = {
  demo: "/demo",
  demoUnknown: "/demo/*unknownDemo",
} as const satisfies Record<PageNameDemo, string>
