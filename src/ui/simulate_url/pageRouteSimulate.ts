import type { PageNameSimulate } from "./pageNameSimulate.js"

export type PageRouteSimulate = keyof typeof pageRouteSimulate

export const pageRouteSimulate = {
  simulate: "/simulate",
  simulateUnknown: "/simulate/*unknownSimulation",
} as const satisfies Record<PageNameSimulate, string>
