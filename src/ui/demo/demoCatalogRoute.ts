import type { DemoCatalogSection } from "./demoCatalogSection.js"
import type { DemoConfiguration } from "./demoConfiguration.js"
import type { DemoScenario } from "./demoScenario.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import type { DemoSpecimen } from "./demoSpecimen.js"

export type DemoCatalogRoute =
  | { kind: "index"; section?: DemoCatalogSection["slug"] }
  | { configuration: DemoConfiguration; kind: "configuration" }
  | { kind: "scenario"; scenario: DemoScenario }
  | { kind: "specimen"; specimen: DemoSpecimen; variant: DemoSessionScreenVariant }
