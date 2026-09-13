import type { DemoCatalogSection } from "./demoCatalogSection.js"
import { demoComponentSpecimenRegistry } from "./demoComponentSpecimenRegistry.js"
import { demoConfigurationRegistry } from "./demoConfigurationRegistry.js"
import { demoScenarioRegistry } from "./demoScenarioRegistry.js"
import { demoScreenSpecimenRegistry } from "./demoScreenSpecimenRegistry.js"

export const demoCatalogRegistry = [
  {
    description: "Backend-independent product screen scenarios.",
    items: [...demoScreenSpecimenRegistry, ...demoScenarioRegistry],
    label: "Screens",
    slug: "screens",
  },
  {
    description: "Real reusable components rendered from fixture state.",
    items: demoComponentSpecimenRegistry,
    label: "Components",
    slug: "components",
  },
  {
    description: "Interactive visual editors using deterministic fixtures and local browser storage.",
    items: demoConfigurationRegistry,
    label: "Config",
    slug: "config",
  },
] as const satisfies readonly DemoCatalogSection[]
