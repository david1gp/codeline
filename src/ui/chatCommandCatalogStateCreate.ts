import type { Accessor } from "solid-js"
import { untrack } from "solid-js/dist/solid.js"
import type { CommandCatalogInspectionResponse } from "../commands/api/commandCatalogInspectionResponseSchema.js"
import { commandCatalogInspectionFetch } from "../commands/client/commandCatalogInspectionFetch.js"
import type { ProjectApiIdentityResponse } from "../project/api/projectApiIdentityResponseSchema.js"
import { projectIdentityFetch } from "../project/client/projectIdentityFetch.js"
import type { ChatCommandCatalogSource } from "./chatCommandView.js"
import { httpQueryStateCreate } from "./httpQueryStateCreate.js"

type ChatCommandCatalogStateOptions = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  /** Enabled tools of the agent that will run the command's shell interpolation. */
  isBashEnabled?: Accessor<boolean>
  isEnabled?: Accessor<boolean>
  isOnline?: Accessor<boolean>
  projectPath: Accessor<string | null>
}

/**
 * Project-scoped command catalog read shared by the pre-session and existing-session
 * composers. Discovery stays server-owned: the browser resolves a project reference
 * to its stable id and never scans command paths itself.
 */
export function chatCommandCatalogStateCreate(options: ChatCommandCatalogStateOptions): ChatCommandCatalogSource {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const request = { fetch: fetchImplementation }
  const isEnabled = () => (options.isEnabled?.() ?? true) && options.isOnline?.() !== false

  const projectQuery = httpQueryStateCreate<ProjectApiIdentityResponse>({
    enabled: isEnabled,
    key: () => {
      const projectPath = options.projectPath()
      return projectPath === null ? undefined : `/api/project/identity?path=${encodeURIComponent(projectPath)}`
    },
    load: async (_key, signal) =>
      projectIdentityFetch(untrack(() => options.projectPath()) ?? "", { ...request, signal }),
  })

  const projectId = () => projectQuery.data()?.id ?? null

  const catalogQuery = httpQueryStateCreate<CommandCatalogInspectionResponse>({
    enabled: isEnabled,
    key: () => {
      const id = projectId()
      return id === null ? undefined : `/api/project/commands/catalog?project=${id}`
    },
    load: async (_key, signal) =>
      commandCatalogInspectionFetch(untrack(() => projectId()) ?? "", { ...request, signal }),
  })

  return {
    commands: () => catalogQuery.data()?.commands ?? [],
    errorMessage: () => catalogQuery.errorMessage() ?? projectQuery.errorMessage(),
    isBashEnabled: () => options.isBashEnabled?.() ?? false,
    retry: () => {
      projectQuery.retry()
      catalogQuery.retry()
    },
    status: () => {
      if (!isEnabled()) return "unavailable"
      // Without a project reference there is nothing to discover, so the composer
      // says so immediately instead of waiting on a read that never starts.
      if (options.projectPath() === null) return "unavailable"
      if (projectQuery.isError() || catalogQuery.isError()) return "error"
      if (catalogQuery.data() !== undefined) return "ready"
      if (projectId() === null && projectQuery.isComplete()) return "unavailable"
      return "loading"
    },
  }
}
