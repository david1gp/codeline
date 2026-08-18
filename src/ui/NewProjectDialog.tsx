import { mdiFolderPlusOutline } from "@mdi/js"
import { For, Match, Show, Switch, type JSX } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuDialog } from "#ui/interactive/dialog/CorvuDialog.jsx"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { newProjectDialogStateCreate } from "./newProjectDialogStateCreate.js"

export function NewProjectDialog(props: {
  activeProject: ActiveProjectState
  buttonClass?: string
  buttonChildren?: JSX.Element
  idPrefix: string
  onProjectConfirmed?: (projectPath: string) => void
  onOpenChange?: (open: boolean) => void
  open?: () => boolean
}) {
  const state = newProjectDialogStateCreate({
    activeProject: props.activeProject,
    idPrefix: props.idPrefix,
    onProjectConfirmed: props.onProjectConfirmed,
    open: props.open,
  })

  return (
    <CorvuDialog
      title="New Project"
      description="Select an existing folder. Codeline will not create a directory."
      buttonChildren={props.buttonChildren ?? "New Project"}
      class={props.buttonClass ?? "h-8 w-full justify-start px-2 text-xs font-normal text-faint"}
      icon={mdiFolderPlusOutline}
      iconClass="size-4"
      innerClass="w-[min(92vw,36rem)]"
      open={state.open()}
      onOpenChange={(open) => {
        state.openChange(open)
        props.onOpenChange?.(open)
      }}
      variant={buttonVariant.ghost}
    >
      <form class="grid gap-3" onSubmit={state.formSubmit}>
        <label class="text-sm font-medium" for={state.inputId}>
          Folder path
        </label>
        <Input
          id={state.inputId}
          value={state.path()}
          aria-controls={state.suggestionsId}
          aria-describedby={state.helpId}
          aria-invalid={state.confirmStatus() === "error"}
          autocomplete="off"
          placeholder="/home/user/projects/example"
          onInput={state.pathInput}
        />
        <p id={state.helpId} class="m-0 text-xs text-muted-foreground">
          Type a path, choose a suggestion, then confirm the folder.
        </p>

        <div id={state.suggestionsId} class="min-h-8" aria-live="polite">
          <Switch>
            <Match when={state.suggestionStatus() === "loading"}>
              <p class="m-0 text-xs text-muted-foreground" role="status">
                Loading folder suggestions…
              </p>
            </Match>
            <Match when={state.suggestionStatus() === "error"}>
              <p class="m-0 text-xs text-danger" role="status">
                Folder suggestions could not be loaded. You can still confirm a typed path.
              </p>
            </Match>
            <Match when={state.suggestionStatus() === "ready" && state.suggestions().length === 0}>
              <p class="m-0 text-xs text-muted-foreground" role="status">
                No matching folders.
              </p>
            </Match>
            <Match when={state.suggestions().length > 0}>
              <ul class="m-0 grid max-h-52 list-none gap-1 overflow-y-auto p-0" aria-label="Folder suggestions">
                <For each={state.suggestions()}>
                  {(suggestion) => (
                    <li>
                      <Button
                        class="h-auto w-full justify-start px-2 py-1.5 text-left"
                        data-path={suggestion.path}
                        variant={buttonVariant.ghost}
                        onClick={state.suggestionClick}
                      >
                        <span class="min-w-0">
                          <span class="block text-sm text-foreground">{suggestion.label}</span>
                          <span class="block truncate text-xs text-muted-foreground">{suggestion.path}</span>
                        </span>
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </Match>
          </Switch>
        </div>

        <Show when={state.errorMessage()}>
          {(message) => (
            <p class="m-0 text-xs text-danger" role="alert">
              {message()}
            </p>
          )}
        </Show>

        <div class="flex justify-end">
          <Button type="submit" disabled={state.confirmStatus() === "confirming"} variant={buttonVariant.outline}>
            <Show when={state.confirmStatus() === "confirming"} fallback="Use Project">
              Confirming…
            </Show>
          </Button>
        </div>
      </form>
    </CorvuDialog>
  )
}
