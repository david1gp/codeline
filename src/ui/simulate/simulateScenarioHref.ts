import type { SimulateScenarioSlug } from "./simulateScenario.js"

export function simulateScenarioHref(slug: SimulateScenarioSlug): string {
  return `/simulate/${slug}`
}
