import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { FilesScreenView } from "../../project/ui/filesScreenView.js"
import { filesProjectSelectorOptionsDerive } from "../../project/ui/filesProjectSelectorOptionsDerive.js"
import { demoProjectBrowserStateCreate } from "./demoProjectBrowserStateCreate.js"
import { demoProjectsFixture } from "./demoProjectsFixture.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

/** Serves files screen state from fixtures so specimens never call the API. */
export function demoFilesScreenStateCreate(
  variant: () => DemoSessionScreenVariant,
  browserVariant: () => DemoSessionScreenVariant = variant,
): FilesScreenView {
  const browser = demoProjectBrowserStateCreate(browserVariant)
  const selectedProjectId = createSignalObject<string>(demoProjectsFixture[0].id)
  const projects = () => (variant() === "empty" ? [] : demoProjectsFixture)
  const hasProjects = () => variant() !== "empty" && variant() !== "error" && variant() !== "loading"

  return {
    browser: () => (hasProjects() ? browser : null),
    projectSelectorOptions: () => filesProjectSelectorOptionsDerive(projects()),
    projects,
    projectSelect: (projectId) => {
      if (projects().some((project) => project.id === projectId)) selectedProjectId.set(projectId)
    },
    retry: () => {},
    selectedProject: () => projects().find((project) => project.id === selectedProjectId.get()) ?? null,
    status: () => {
      if (variant() === "loading") return "loading"
      if (variant() === "error") return "error"
      return "ready"
    },
    truncated: () => variant() === "streaming",
  }
}
