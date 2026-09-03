export type PageNameSimulate = keyof typeof pageNameSimulate

export const pageNameSimulate = {
  simulate: "simulate",
  simulateUnknown: "simulateUnknown",
} as const
