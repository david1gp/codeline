import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { activeProjectStateCreate } from "../activeProjectStateCreate.js"
import type { NewSessionProject } from "../newSessionDialogStateCreate.js"
import { demoProjectRegistryStateCreate } from "./demoProjectRegistryStateCreate.js"
import { demoSessionTargetSelectorStateCreate } from "./demoSessionTargetSelectorStateCreate.js"

const demoProjects = [
  {
    available: true,
    id: "codeline",
    projectLabel: "Codeline",
    projectPath: "/home/demo/adaptive/codeline",
  },
  {
    available: true,
    id: "design-system",
    projectLabel: "Adaptive Design System",
    projectPath: "/home/demo/adaptive/solid-ui",
  },
  {
    available: false,
    id: "archived-tools",
    projectLabel: "Archived tools",
    projectPath: "/mnt/archive/tools",
  },
] as const satisfies readonly NewSessionProject[]

const demoProjectFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input)
  if (url.startsWith("/api/project/suggestions")) {
    return Response.json({ suggestions: [{ label: "Demo workspace", path: "/home/demo/adaptive/demo-workspace" }] })
  }
  if (url === "/api/project/registry" && init?.method === "POST") {
    return Response.json({
      project: {
        available: true,
        faviconUrl: null,
        id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f70",
        label: "Demo workspace",
        parentFolder: null,
      },
    })
  }
  return Response.json({ error: { code: "demo.not-found", message: "Demo endpoint not available." } }, { status: 404 })
}

export function demoNewSessionDialogStateCreate() {
  const projectIdOverride = createSignalObject<string | null>(null)
  const projectPathOverride = createSignalObject<string | null>(null)
  const selectedOutcome = createSignalObject("No project selected yet.")
  const selectedSessionId = createSignalObject<string | null>(null)

  const sessionSelected = () => {
    const selectedId = projectIdOverride.get()
    const selectedPath = projectPathOverride.get()
    const selected = demoProjects.find((project) => project.id === selectedId || project.projectPath === selectedPath)
    if (selected === undefined) return
    selectedOutcome.set(`${selected.projectLabel} — ${selected.projectPath}`)
  }

  return {
    activeProject: activeProjectStateCreate({
      id: "codeline",
      label: "Codeline",
      path: "/home/demo/adaptive/codeline",
    }),
    projectFetch: demoProjectFetch,
    projectIdOverride,
    projectPathOverride,
    projectRegistry: demoProjectRegistryStateCreate(),
    projects: () => demoProjects,
    selectedOutcome: selectedOutcome.get,
    sessionTarget: demoSessionTargetSelectorStateCreate(() => "ready", selectedSessionId, sessionSelected),
  }
}
