import type { DemoCatalogSection } from "./demoCatalogSection.js"
import type { DemoScenario } from "./demoScenario.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import type { DemoSpecimen } from "./demoSpecimen.js"

export type DemoCatalogRoute =
  | { kind: "index"; section?: DemoCatalogSection["slug"] }
  | { kind: "scenario"; scenario: DemoScenario }
  | { kind: "specimen"; specimen: DemoSpecimen; variant: DemoSessionScreenVariant }
