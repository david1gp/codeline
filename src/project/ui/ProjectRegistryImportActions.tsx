import { Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { projectRegistryImportActionsStateCreate } from "./projectRegistryImportActionsStateCreate.js"
import type { ProjectRegistryState } from "./projectRegistryState.js"

export function ProjectRegistryImportActions(props: {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onImported?: (count: number) => void
  projectRegistry?: ProjectRegistryState
}) {
  const state = projectRegistryImportActionsStateCreate({
    fetch: props.fetch,
    onImported: props.onImported,
    projectRegistry: () => props.projectRegistry,
  })

  return (
    <div class="grid gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={state.buttonDisabled()}
          variant={buttonVariant.outline}
          onClick={() => void state.projectImport()}
        >
          {state.buttonLabel()}
        </Button>
      </div>

      <Show when={state.status() === "success"}>
        <p class="m-0 text-sm text-foreground" role="status">
          {state.feedbackMessage()}
        </p>
      </Show>

      <Show when={state.status() === "error"}>
        <p class="m-0 text-sm text-danger" role="alert">
          {state.feedbackMessage()}
        </p>
      </Show>
    </div>
  )
}
