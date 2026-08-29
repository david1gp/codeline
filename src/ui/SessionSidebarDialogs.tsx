import { Show } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuDialog } from "#ui/interactive/dialog/CorvuDialog.jsx"
import { BlackBulletPoints } from "#ui/static/lists/BlackBulletPoints.jsx"
import type { SessionSidebarActionsState } from "./sessionSidebarActionsStateCreate.js"

export function SessionSidebarDialogs(props: { actions: SessionSidebarActionsState }) {
  const actions = props.actions
  const dialog = () => actions.dialog()
  const projectPath = () => {
    const current = dialog()
    return current.kind === "projectRename" || current.kind === "projectDelete" || current.kind === "projectRemove"
      ? current.projectPath
      : ""
  }
  const projectRemoveLabel = () => {
    const current = dialog()
    return current.kind === "projectRemove" ? current.projectLabel : ""
  }
  const sessionId = () => {
    const current = dialog()
    return current.kind === "sessionRename" || current.kind === "sessionDelete" ? current.sessionId : ""
  }

  return (
    <>
      <CorvuDialog
        title="Rename project"
        buttonChildren={null}
        class="hidden"
        open={dialog().kind === "projectRename"}
        onOpenChange={(open) => {
          if (!open) actions.dialogClose()
        }}
      >
        <form
          class="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void actions.projectRenameSubmit()
          }}
        >
          <label class="text-sm font-medium" for="sidebar-project-rename">
            Project name
          </label>
          <Input
            id="sidebar-project-rename"
            value={actions.draft()}
            disabled={actions.isSaving()}
            onInput={(event) => actions.draftChange(event.currentTarget.value)}
          />
          <Show when={actions.errorMessage()}>
            {(message) => (
              <p class="m-0 text-xs text-danger" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <div class="flex justify-end">
            <Button type="submit" variant={buttonVariant.contrast} disabled={actions.isSaving()}>
              {actions.isSaving() ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </CorvuDialog>

      <CorvuDialog
        title="Remove project"
        description="Remove this project from your registered projects. Historical sessions will not be deleted."
        buttonChildren={null}
        class="hidden"
        open={dialog().kind === "projectRemove"}
        onOpenChange={(open) => {
          if (!open) actions.dialogClose()
        }}
      >
        <div class="grid gap-3">
          <p class="m-0 text-sm text-strong">
            Remove {projectRemoveLabel() || actions.projectLabel(projectPath())} from registered projects?
          </p>
          <p class="m-0 text-xs text-faint">Historical sessions and filesystem contents will not be deleted.</p>
          <Show when={actions.errorMessage()}>
            {(message) => (
              <p class="m-0 text-xs text-danger" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <div class="flex justify-end gap-2">
            <Button variant={buttonVariant.ghost} onClick={actions.dialogClose} disabled={actions.isSaving()}>
              Cancel
            </Button>
            <Button
              variant={buttonVariant.filledRed}
              disabled={actions.isSaving()}
              onClick={() => void actions.projectRemoveSubmit()}
            >
              {actions.isSaving() ? "Removing..." : "Remove"}
            </Button>
          </div>
        </div>
      </CorvuDialog>

      <CorvuDialog
        title="Delete project"
        description="This deletes every session in the project."
        buttonChildren={null}
        class="hidden"
        open={dialog().kind === "projectDelete"}
        onOpenChange={(open) => {
          if (!open) actions.dialogClose()
        }}
      >
        <div class="grid gap-3">
          <p class="m-0 text-sm text-strong">Delete {actions.projectLabel(projectPath())} and these sessions?</p>
          <BlackBulletPoints points={[...actions.sessionTitlesForProject(projectPath())]} />
          <Show when={actions.errorMessage()}>
            {(message) => (
              <p class="m-0 text-xs text-danger" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <div class="flex justify-end gap-2">
            <Button variant={buttonVariant.ghost} onClick={actions.dialogClose} disabled={actions.isSaving()}>
              Cancel
            </Button>
            <Button
              variant={buttonVariant.filledRed}
              disabled={actions.isSaving()}
              onClick={() => void actions.projectDeleteSubmit()}
            >
              {actions.isSaving() ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </CorvuDialog>

      <CorvuDialog
        title="Rename session"
        buttonChildren={null}
        class="hidden"
        open={dialog().kind === "sessionRename"}
        onOpenChange={(open) => {
          if (!open) actions.dialogClose()
        }}
      >
        <form
          class="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void actions.sessionRenameSubmit()
          }}
        >
          <label class="text-sm font-medium" for="sidebar-session-rename">
            Session title
          </label>
          <Input
            id="sidebar-session-rename"
            value={actions.draft()}
            disabled={actions.isSaving()}
            onInput={(event) => actions.draftChange(event.currentTarget.value)}
          />
          <Show when={actions.errorMessage()}>
            {(message) => (
              <p class="m-0 text-xs text-danger" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <div class="flex justify-end">
            <Button type="submit" variant={buttonVariant.contrast} disabled={actions.isSaving()}>
              {actions.isSaving() ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </CorvuDialog>

      <CorvuDialog
        title="Delete session"
        buttonChildren={null}
        class="hidden"
        open={dialog().kind === "sessionDelete"}
        onOpenChange={(open) => {
          if (!open) actions.dialogClose()
        }}
      >
        <div class="grid gap-3">
          <p class="m-0 text-sm text-strong">Delete {actions.sessionTitle(sessionId()) ?? "this session"}?</p>
          <Show when={actions.errorMessage()}>
            {(message) => (
              <p class="m-0 text-xs text-danger" role="alert">
                {message()}
              </p>
            )}
          </Show>
          <div class="flex justify-end gap-2">
            <Button variant={buttonVariant.ghost} onClick={actions.dialogClose} disabled={actions.isSaving()}>
              Cancel
            </Button>
            <Button
              variant={buttonVariant.filledRed}
              disabled={actions.isSaving()}
              onClick={() => void actions.sessionDeleteSubmit()}
            >
              {actions.isSaving() ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </CorvuDialog>
    </>
  )
}
