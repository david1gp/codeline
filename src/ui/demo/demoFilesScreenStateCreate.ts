import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { FilesScreenView } from "../filesScreenView.js"
import { demoProjectBrowserStateCreate } from "./demoProjectBrowserStateCreate.js"
import { demoProjectsFixture } from "./demoProjectsFixture.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

/** Serves files screen state from fixtures so specimens never call the API. */
export function demoFilesScreenStateCreate(variant: () => DemoSessionScreenVariant): FilesScreenView {
  const browser = demoProjectBrowserStateCreate(variant)
  const selectedProjectId = createSignalObject<string>(demoProjectsFixture[0].id)
  const projects = () => (variant() === "empty" ? [] : demoProjectsFixture)
  const hasProjects = () => variant() !== "empty" && variant() !== "error" && variant() !== "loading"

  return {
    browser: () => (hasProjects() ? browser : null),
    projects,
    projectSelect: (event) => {
      const projectId = event.currentTarget.value
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
