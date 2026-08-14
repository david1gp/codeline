import { createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import type { ProjectGitBranchList } from "./projectGitBranchListSchema.js"
import { projectGitBranchListSchema } from "./projectGitBranchListSchema.js"
import type { ProjectGitDiffSummary } from "./projectGitDiffSummarySchema.js"
import { projectGitDiffSummarySchema } from "./projectGitDiffSummarySchema.js"
import type { ProjectGitStatus } from "./projectGitStatusSchema.js"
import { projectGitStatusSchema } from "./projectGitStatusSchema.js"

type ProjectGitPanelStateOptions = {
  apiBase?: string
  confirmDelete?: (branch: string) => boolean
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  projectId?: string
}

function createSignalObject<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

export function projectGitPanelStateCreate(options: ProjectGitPanelStateOptions) {
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const confirmDelete = options.confirmDelete ?? ((branch: string) => window.confirm(`Delete local branch ${branch}?`))
  const status = createSignalObject<ProjectGitStatus | null>(null)
  const summary = createSignalObject<ProjectGitDiffSummary | null>(null)
  const branches = createSignalObject<ProjectGitBranchList | null>(null)
  const loadStatus = createSignalObject<"error" | "loading" | "ready">("loading")
  const actionStatus = createSignalObject<"error" | "idle" | "loading" | "success">("idle")
  const message = createSignalObject("")
  const renamingBranch = createSignalObject<string | null>(null)
  let controller: AbortController | undefined
  const requestUrl = (route: string) =>
    options.projectId === undefined
      ? `${apiBase}/${route}`
      : `${apiBase}/${route}?project=${encodeURIComponent(options.projectId)}`

  const load = async () => {
    controller?.abort()
    controller = new AbortController()
    loadStatus.set("loading")
    try {
      const statusResponse = await fetcher(requestUrl("git/status"), { signal: controller.signal })
      if (!statusResponse.ok) throw new Error("The project Git request failed.")
      const parsedStatus = v.safeParse(projectGitStatusSchema, await statusResponse.json())
      if (!parsedStatus.success) throw new Error("The project Git response is invalid.")
      status.set(parsedStatus.output)
      if (!parsedStatus.output.isGitRepository) {
        summary.set(null)
        branches.set(null)
        loadStatus.set("ready")
        return
      }
      const responses = await Promise.all([
        fetcher(requestUrl("git/diff-summary"), { signal: controller.signal }),
        fetcher(requestUrl("git/branches"), { signal: controller.signal }),
      ])
      if (responses.some((response) => !response.ok)) throw new Error("The project Git request failed.")
      const [summaryBody, branchesBody] = await Promise.all(responses.map((response) => response.json()))
      const parsedSummary = v.safeParse(projectGitDiffSummarySchema, summaryBody)
      const parsedBranches = v.safeParse(projectGitBranchListSchema, branchesBody)
      if (!parsedSummary.success || !parsedBranches.success) {
        throw new Error("The project Git response is invalid.")
      }
      summary.set(parsedSummary.output)
      branches.set(parsedBranches.output)
      loadStatus.set("ready")
    } catch (_error) {
      if (controller?.signal.aborted) return
      loadStatus.set("error")
    }
  }

  const mutate = async (action: "delete" | "rename" | "switch", body: Record<string, string>) => {
    actionStatus.set("loading")
    message.set("")
    try {
      const response = await fetcher(requestUrl(`git/branches/${action}`), {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      if (!response.ok) {
        const body = await response.json().catch(() => undefined)
        const parsed = v.safeParse(v.object({ error: v.object({ message: v.string() }) }), body)
        message.set(parsed.success ? parsed.output.error.message : "The branch operation failed.")
        actionStatus.set("error")
        return
      }
      renamingBranch.set(null)
      actionStatus.set("success")
      message.set(`Branch ${action} completed.`)
      await load()
    } catch (_error) {
      message.set("The branch operation failed.")
      actionStatus.set("error")
    }
  }

  void load()
  onCleanup(() => controller?.abort())

  return {
    actionStatus: actionStatus.get,
    branches: branches.get,
    branchDelete: (branch: string) => {
      if (confirmDelete(branch)) void mutate("delete", { branch })
    },
    branchRename: (event: SubmitEvent, branch: string) => {
      event.preventDefault()
      const form = event.currentTarget
      if (!(form instanceof HTMLFormElement)) return
      const newBranch = new FormData(form).get("newBranch")
      if (typeof newBranch === "string") void mutate("rename", { branch, newBranch })
    },
    branchSwitch: (branch: string) => {
      if (status.get()?.isDirty !== false) return
      void mutate("switch", { branch })
    },
    diffSummary: summary.get,
    localBranches: () => {
      const value = branches.get()
      if (value === null) return []
      return [
        ...(value.currentBranch === null ? [] : [{ isCurrent: true, name: value.currentBranch }]),
        ...value.otherBranches.map((name) => ({ isCurrent: false, name })),
      ]
    },
    loadStatus: loadStatus.get,
    message: message.get,
    renameCancel: () => renamingBranch.set(null),
    renameOpen: (branch: string) => renamingBranch.set(branch),
    renamingBranch: renamingBranch.get,
    retry: () => void load(),
    status: status.get,
  }
}
