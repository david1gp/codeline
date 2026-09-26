import { createResultError } from "@adaptive-ds/result"
import type { ProjectRegistryState } from "../../project/ui/projectRegistryState.js"

export function demoProjectRegistryStateCreate(): ProjectRegistryState {
  return {
    availableProjects: () => [],
    errorMessage: () => undefined,
    isEmpty: () => true,
    isError: () => false,
    isLoading: () => false,
    openCodeImport: () => Promise.resolve(createResultError("demo", "Not available in demo")),
    projectFind: () => undefined,
    projectOpenCodeImport: () => Promise.resolve(createResultError("demo", "Not available in demo")),
    projectRegister: () => Promise.resolve(createResultError("demo", "Not available in demo")),
    projectRemove: () => Promise.resolve(createResultError("demo", "Not available in demo")),
    projectRename: () => Promise.resolve(createResultError("demo", "Not available in demo")),
    projects: () => [],
    refresh: () => undefined,
    retry: () => undefined,
    status: () => "ready" as const,
  }
}
