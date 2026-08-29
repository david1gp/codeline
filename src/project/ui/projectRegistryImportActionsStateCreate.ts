import type { Accessor } from "solid-js"
import { signalObjectCreate } from "../../ui/signalObjectCreate.js"
import { projectRegistryOpenCodeImportRequest } from "../client/projectRegistryOpenCodeImportRequest.js"
import type { ProjectRegistryState } from "./projectRegistryStateCreate.js"

export type ProjectRegistryImportStatus = "idle" | "importing" | "success" | "error"

export type ProjectRegistryImportActionsStateOptions = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onImported?: (count: number) => void
  projectRegistry?: Accessor<ProjectRegistryState | undefined>
}

export function projectRegistryImportActionsStateCreate(options: ProjectRegistryImportActionsStateOptions = {}) {
  const status = signalObjectCreate<ProjectRegistryImportStatus>("idle")
  const importedCount = signalObjectCreate<number | null>(null)
  const errorMessage = signalObjectCreate<string | null>(null)

  const isImporting = () => status.get() === "importing"

  const feedbackMessage = (): string | null => {
    const currentStatus = status.get()
    if (currentStatus === "success") {
      const count = importedCount.get() ?? 0
      return count === 1 ? "Imported 1 project." : `Imported ${count} projects.`
    }
    if (currentStatus === "error") {
      return errorMessage.get() ?? "Failed to import OpenCode projects."
    }
    return null
  }

  const projectImport = async (): Promise<boolean> => {
    if (status.get() === "importing") return false
    status.set("importing")
    errorMessage.set(null)
    importedCount.set(null)

    const registry = options.projectRegistry?.()
    const result =
      registry !== undefined
        ? await registry.openCodeImport()
        : await projectRegistryOpenCodeImportRequest({ fetch: options.fetch })

    if (!result.success) {
      status.set("error")
      errorMessage.set(result.errorMessage || "Failed to import OpenCode projects.")
      return false
    }

    status.set("success")
    importedCount.set(result.data.importedCount)
    options.onImported?.(result.data.importedCount)
    return true
  }

  return {
    buttonDisabled: isImporting,
    buttonLabel: () => (isImporting() ? "Importing…" : "Import OpenCode projects"),
    errorMessage: errorMessage.get,
    feedbackMessage,
    importedCount: importedCount.get,
    isImporting,
    projectImport,
    status: status.get,
  }
}

export type ProjectRegistryImportActionsState = ReturnType<typeof projectRegistryImportActionsStateCreate>
