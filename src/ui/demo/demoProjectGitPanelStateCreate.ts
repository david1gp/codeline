import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { ProjectGitPanelView } from "../../project/projectGitPanelView.js"
import { demoProjectGitFixture } from "./demoProjectGitFixture.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

/** Serves Git panel state from fixtures so specimens never run Git commands. */
export function demoProjectGitPanelStateCreate(variant: () => DemoSessionScreenVariant): ProjectGitPanelView {
  const renamingBranch = createSignalObject<string | null>(null)
  const isEmpty = () => variant() === "empty"

  const status = () => {
    if (isEmpty()) return { branch: null, files: [], isDirty: false, isGitRepository: false }
    if (variant() === "streaming") return { ...demoProjectGitFixture.status, files: [], isDirty: false }
    return demoProjectGitFixture.status
  }

  return {
    actionStatus: () => (variant() === "error" ? "error" : "idle"),
    branchDelete: () => {},
    branchRename: (event: SubmitEvent) => event.preventDefault(),
    branchSwitch: () => {},
    diffSummary: () => (isEmpty() ? null : demoProjectGitFixture.diffSummary),
    loadStatus: () => {
      if (variant() === "loading") return "loading"
      if (variant() === "error") return "error"
      return "ready"
    },
    localBranches: () => {
      if (isEmpty()) return []
      const { currentBranch, otherBranches } = demoProjectGitFixture.branches
      return [{ isCurrent: true, name: currentBranch }, ...otherBranches.map((name) => ({ isCurrent: false, name }))]
    },
    message: () => (variant() === "error" ? "The branch operation failed." : ""),
    renameCancel: () => renamingBranch.set(null),
    renameOpen: (branch: string) => renamingBranch.set(branch),
    renamingBranch: () =>
      variant() === "editing" ? demoProjectGitFixture.branches.otherBranches[0] : renamingBranch.get(),
    retry: () => {},
    status,
  }
}
