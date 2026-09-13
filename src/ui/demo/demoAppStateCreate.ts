import { useLocation, useSearchParams } from "@solidjs/router"
import { configurationEditorStateCreate } from "../configuration/configurationEditorStateCreate.js"
import { resizableSidebarStateCreate } from "../resizableSidebarStateCreate.js"
import { demoCatalogRegistry } from "./demoCatalogRegistry.js"
import { demoCatalogRouteResolve } from "./demoCatalogRouteResolve.js"
import type { DemoScenarioFixture } from "./demoScenarioFixture.js"
import { demoScenarioFixtures } from "./demoScenarioFixtures.js"
import { demoSessionWorkspaceStateCreate } from "./demoSessionWorkspaceStateCreate.js"
import { demoSpecimenStateCreate } from "./demoSpecimenStateCreate.js"
import { demoWorkspaceFixtures } from "./demoWorkspaceFixtures.js"
import { demoWorkspacePanelStateCreate } from "./demoWorkspacePanelStateCreate.js"

export function demoAppStateCreate() {
  const location = useLocation()
  const [searchParams, searchParamsSet] = useSearchParams()
  const route = () => demoCatalogRouteResolve(location.pathname, searchParams.variant)
  const configurationStates = {
    commands: configurationEditorStateCreate("commands", "codeline-demo-config-commands"),
    skills: configurationEditorStateCreate("skills", "codeline-demo-config-skills"),
    subagents: configurationEditorStateCreate("subagents", "codeline-demo-config-subagents"),
  }
  const sidebar = resizableSidebarStateCreate({
    defaultWidth: 260,
    maximumWidth: 380,
    minimumWidth: 200,
    storageKey: "codeline-demo-catalog-sidebar-width",
  })
  const configuration = () => {
    const resolved = route()
    return resolved.kind === "configuration" ? resolved.configuration : undefined
  }
  const configurationState = () => {
    const selected = configuration()
    return selected ? configurationStates[selected.slug] : undefined
  }
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
  const fixture = (): DemoScenarioFixture | undefined => {
    const selected = scenario()
    return selected ? demoScenarioFixtures[selected.slug] : undefined
  }
  const workspacePanelState = demoWorkspacePanelStateCreate(() => {
    const selected = fixture()
    return selected && "workspace" in selected && selected.workspace ? selected.workspace : demoWorkspaceFixtures.files
  })
  const sessionWorkspaceState = demoSessionWorkspaceStateCreate(() => fixture()?.sessionWorkspace)
  const indexSections = () => {
    const resolved = route()
    if (resolved.kind !== "index" || !resolved.section) return demoCatalogRegistry
    return demoCatalogRegistry.filter((section) => section.slug === resolved.section)
  }
  const activeSlug = () => configuration()?.slug ?? scenario()?.slug ?? specimen()?.slug

  return {
    activeSlug,
    configuration,
    configurationState,
    fixture,
    indexSections,
    scenario,
    sessionWorkspaceState,
    sections: demoCatalogRegistry,
    sidebar,
    specimen,
    specimenState: demoSpecimenStateCreate(variant),
    variant,
    variantSelect: (selected: string) => searchParamsSet({ variant: selected }, { replace: true }),
    workspacePanelState,
  }
}
