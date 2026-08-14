import { demoCatalogRegistry } from "./demoCatalogRegistry.js"
import type { DemoCatalogRoute } from "./demoCatalogRoute.js"
import { demoScenarioRegistry } from "./demoScenarioRegistry.js"
import { demoSessionScreenVariantParse } from "./demoSessionScreenVariantParse.js"
import type { DemoSpecimen } from "./demoSpecimen.js"

function demoSpecimenIs(item: { slug: string }): item is DemoSpecimen {
  return "variants" in item
}

export function demoCatalogRouteResolve(pathname: string, variant?: unknown): DemoCatalogRoute {
  const segments = pathname
    .replace(/^\/demo\/?/, "")
    .split("/")
    .filter(Boolean)
  if (segments.length === 0) return { kind: "index" }

  const section = demoCatalogRegistry.find((candidate) => candidate.slug === segments[0])
  if (section && segments.length === 1) return { kind: "index", section: section.slug }
  if (section && segments.length === 2) {
    const item = section.items.find((candidate) => candidate.slug === segments[1])
    if (item && demoSpecimenIs(item)) {
      return { kind: "specimen", specimen: item, variant: demoSessionScreenVariantParse(item, variant) }
    }
    if (item) return { kind: "scenario", scenario: item }
  }

  // Keep every pre-catalog URL addressable.
  if (segments.length === 1) {
    const scenario = demoScenarioRegistry.find((candidate) => candidate.slug === segments[0])
    if (scenario) return { kind: "scenario", scenario }
  }

  return { kind: "index" }
}
