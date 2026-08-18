import { Match, Show, Switch } from "solid-js"
import { Label } from "#ui/input/label/Label.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import type { SessionTargetConfigurationView } from "./sessionTargetConfigurationView.js"

const fieldClass = "grid gap-1.5 text-xs font-semibold text-faint"

export function WorkspaceSetupPanel(props: { configuration: SessionTargetConfigurationView }) {
  return (
    <div class="flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-y-auto px-5 py-8 max-[760px]:px-4">
      <section
        class="relative w-full max-w-[720px] overflow-hidden rounded-[18px] border border-line bg-surface-raised px-8 py-8 shadow-[0_1px_2px_var(--shadow-color),0_18px_50px_-28px_var(--shadow-color-strong)] max-[760px]:rounded-2xl max-[760px]:px-5 max-[760px]:py-6"
        aria-labelledby="workspace-setup-heading"
      >
        <div class="absolute inset-x-0 top-0 h-1 bg-accent" aria-hidden="true" />
        <p class="m-0 font-mono text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">Workspace setup</p>

        <Switch>
          <Match when={props.configuration.status === "loading"}>
            <div class="mt-5" role="status" aria-live="polite">
              <h2 id="workspace-setup-heading" class="m-0 text-xl font-semibold tracking-[-0.02em]">
                Checking workspace readiness
              </h2>
              <p class="mt-2 mb-0 text-sm text-faint">Loading servers and execution agents.</p>
            </div>
          </Match>

          <Match when={props.configuration.status === "no-server"}>
            <div class="mt-5">
              <h2 id="workspace-setup-heading" class="m-0 text-xl font-semibold tracking-[-0.02em]">
                No machine is available for this organization
              </h2>
              <p class="mt-3 mb-5 text-sm leading-6 text-faint">
                No machine is configured or available for the organization linked to your signed-in account.
              </p>
              <Button variant="outline" onClick={props.configuration.retry}>
                Check servers again
              </Button>
            </div>
          </Match>

          <Match when={props.configuration.status === "server-error"}>
            <div class="mt-5" role="alert">
              <h2 id="workspace-setup-heading" class="m-0 text-xl font-semibold tracking-[-0.02em]">
                Servers could not be loaded
              </h2>
              <p class="mt-3 mb-5 text-sm leading-6 text-danger">
                {props.configuration.errorMessage ?? "Check the API connection and try again."}
              </p>
              <Button variant="outlineRed" onClick={props.configuration.retry}>
                Retry servers
              </Button>
            </div>
          </Match>

          <Match when={true}>
            <div class="mt-5">
              <div>
                <h2 id="workspace-setup-heading" class="m-0 text-xl font-semibold tracking-[-0.02em]">
                  Ready for local execution
                </h2>
                <p class="mt-2 mb-0 text-sm leading-6 text-faint">New conversations use the local execution agent.</p>
              </div>

              <div class="mt-6 grid gap-4">
                <Label class={fieldClass}>
                  Execution agent
                  <div class="min-h-10 rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-strong">
                    {props.configuration.agents.find((agent) => agent.id === props.configuration.selectedAgentId)
                      ?.name ?? "No local agent configured"}
                  </div>
                </Label>
              </div>

              <Show when={props.configuration.status === "no-agent"}>
                <p class="mt-4 mb-0 text-sm text-faint">No local execution agent is available.</p>
              </Show>
              <Show when={props.configuration.status === "agent-error"}>
                <div class="mt-4 flex items-center justify-between gap-3" role="alert">
                  <p class="m-0 text-sm text-danger">The selected agent could not be loaded.</p>
                  <Button variant="outlineRed" size="sm" onClick={props.configuration.retry}>
                    Retry agent
                  </Button>
                </div>
              </Show>

              <Show when={props.configuration.errorMessage !== null}>
                <p class="mt-4 mb-0 text-sm text-danger" role="alert">
                  {props.configuration.errorMessage}
                </p>
              </Show>

              <Show when={props.configuration.selectedAgentId !== null && !props.configuration.isCreatingAgent}>
                <div class="mt-6 flex items-center justify-between gap-4 border-line-subtle border-t pt-6 max-[600px]:items-stretch max-[600px]:flex-col">
                  <p class="m-0 text-sm text-faint">Start a new conversation with the selected execution agent.</p>
                  <Button
                    variant="contrast"
                    disabled={props.configuration.sessionCreateStatus === "creating"}
                    onClick={() => void props.configuration.sessionCreateStart()}
                  >
                    {props.configuration.sessionCreateStatus === "creating" ? "Starting…" : "Start conversation"}
                  </Button>
                </div>
              </Show>
              <Show when={props.configuration.sessionCreateStatus === "error"}>
                <p class="mt-3 mb-0 text-sm text-danger" role="alert">
                  {props.configuration.sessionCreateErrorMessage ?? "The conversation could not be started. Try again."}
                </p>
              </Show>
            </div>
          </Match>
        </Switch>
      </section>
    </div>
  )
}
