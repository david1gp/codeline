import type { DemoConfiguration } from "./demoConfiguration.js"
import type { DemoScenario } from "./demoScenario.js"
import type { DemoSpecimen } from "./demoSpecimen.js"

export interface DemoCatalogSection {
  description: string
  items: readonly (DemoConfiguration | DemoScenario | DemoSpecimen)[]
  label: "Components" | "Config" | "Screens"
  slug: "components" | "config" | "screens"
}
