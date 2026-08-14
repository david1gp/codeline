import { useLocation, useSearchParams } from "@solidjs/router"
import { demoCatalogRegistry } from "./demoCatalogRegistry.js"
import { demoCatalogRouteResolve } from "./demoCatalogRouteResolve.js"
import { demoScenarioFixtures } from "./demoScenarioFixtures.js"
import { demoSpecimenStateCreate } from "./demoSpecimenStateCreate.js"
import { demoWorkspaceFixtures } from "./demoWorkspaceFixtures.js"
import { demoWorkspacePanelStateCreate } from "./demoWorkspacePanelStateCreate.js"

export function demoAppStateCreate() {
  const location = useLocation()
  const [searchParams, searchParamsSet] = useSearchParams()
  const route = () => demoCatalogRouteResolve(location.pathname, searchParams.variant)
  const scenario = () => {
    const resolved = route()
    return resolved.kind === "scenario" ? resolved.scenario : undefined
  }
  const specimen = () => {
    const resolved = route()
    return resolved.kind === "specimen" ? resolved.specimen : undefined
  }
  const variant = () => {
    const resolved = route()
    return resolved.kind === "specimen" ? resolved.variant : "ready"
  }
  const fixture = () => {
    const selected = scenario()
    return selected ? demoScenarioFixtures[selected.slug] : undefined
  }
  const workspacePanelState = demoWorkspacePanelStateCreate(() => {
    const selected = fixture()
    return selected && "workspace" in selected && selected.workspace ? selected.workspace : demoWorkspaceFixtures.files
  })
  const indexSections = () => {
    const resolved = route()
    if (resolved.kind !== "index" || !resolved.section) return demoCatalogRegistry
    return demoCatalogRegistry.filter((section) => section.slug === resolved.section)
  }
  const activeSlug = () => scenario()?.slug ?? specimen()?.slug

  return {
    activeSlug,
    fixture,
    indexSections,
    scenario,
    sections: demoCatalogRegistry,
    specimen,
    specimenState: demoSpecimenStateCreate(variant),
    variant,
    variantSelect: (selected: string) => searchParamsSet({ variant: selected }, { replace: true }),
    workspacePanelState,
  }
}
