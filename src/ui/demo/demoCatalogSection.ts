import type { DemoScenario } from "./demoScenario.js"
import type { DemoSpecimen } from "./demoSpecimen.js"

export interface DemoCatalogSection {
  description: string
  items: readonly (DemoScenario | DemoSpecimen)[]
  label: "Components" | "Screens"
  slug: "components" | "screens"
}
