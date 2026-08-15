import { Input } from "#ui/input/input/Input.jsx"
import { Label } from "#ui/input/label/Label.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { For, Match, Show, Switch } from "solid-js"
import type { SessionTargetConfigurationView } from "./sessionTargetConfigurationView.js"

const selectClass =
  "min-h-10 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-strong focus-visible:outline-2 focus-visible:outline-accent"
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
                No Codeline server is available
              </h2>
              <p class="mt-3 mb-5 text-sm leading-6 text-faint">
                This workspace needs a server before an execution agent can be configured.
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
              <div class="flex items-start justify-between gap-4 max-[600px]:flex-col">
                <div>
                  <h2 id="workspace-setup-heading" class="m-0 text-xl font-semibold tracking-[-0.02em]">
                    Configure an execution agent
                  </h2>
                  <p class="mt-2 mb-0 text-sm leading-6 text-faint">
                    Select a server and agent, or add a Codex-LB or CLIProxyAPI agent.
                  </p>
                </div>
                <Button variant="outline" onClick={props.configuration.agentCreateBegin}>
                  New agent
                </Button>
              </div>

              <div class="mt-6 grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
                <Label class={fieldClass}>
                  Server
                  <select
                    class={selectClass}
                    aria-label="Codeline server"
                    value={props.configuration.selectedServerId ?? ""}
                    onChange={(event) => props.configuration.serverSelect(event.currentTarget.value)}
                  >
                    <For each={props.configuration.servers}>
                      {(server) => <option value={server.id}>{server.name}</option>}
                    </For>
                  </select>
                </Label>

                <Label class={fieldClass}>
                  Execution agent
                  <select
                    class={selectClass}
                    aria-label="Execution agent"
                    disabled={props.configuration.agents.length === 0}
                    value={props.configuration.isCreatingAgent ? "" : (props.configuration.selectedAgentId ?? "")}
                    onChange={(event) => props.configuration.agentSelect(event.currentTarget.value)}
                  >
                    <Show when={props.configuration.isCreatingAgent || props.configuration.agents.length === 0}>
                      <option value="">
                        {props.configuration.agents.length === 0 ? "No agents configured" : "New agent"}
                      </option>
                    </Show>
                    <For each={props.configuration.agents}>
                      {(agent) => (
                        <option value={agent.id}>
                          {agent.name} · {agent.role}
                        </option>
                      )}
                    </For>
                  </select>
                </Label>
              </div>

              <Show when={props.configuration.status === "no-agent"}>
                <p class="mt-4 mb-0 text-sm text-faint">
                  No execution agent exists on this server. Create the first one below.
                </p>
              </Show>
              <Show when={props.configuration.status === "agent-error"}>
                <div class="mt-4 flex items-center justify-between gap-3" role="alert">
                  <p class="m-0 text-sm text-danger">The selected agent could not be loaded.</p>
                  <Button variant="outlineRed" size="sm" onClick={props.configuration.retry}>
                    Retry agent
                  </Button>
                </div>
              </Show>

              <Show when={props.configuration.isConfigurableAgent}>
                <form
                  class="mt-6 grid gap-4 border-line-subtle border-t pt-6"
                  onSubmit={(event) => event.preventDefault()}
                >
                  <h3 class="m-0 text-sm font-semibold">
                    {props.configuration.isCreatingAgent ? "New agent configuration" : "Agent configuration"}
                  </h3>
                  <div class="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
                    <Label class={fieldClass}>
                      Name
                      <Input
                        value={props.configuration.draft.name}
                        maxlength={200}
                        onInput={(event) => props.configuration.draftNameChange(event.currentTarget.value)}
                      />
                    </Label>
                    <Label class={fieldClass}>
                      Role
                      <Input
                        value={props.configuration.draft.role}
                        maxlength={200}
                        onInput={(event) => props.configuration.draftRoleChange(event.currentTarget.value)}
                      />
                    </Label>
                    <Label class={fieldClass}>
                      Provider
                      <select
                        class={selectClass}
                        value={props.configuration.draft.provider}
                        onChange={(event) =>
                          props.configuration.draftProviderChange(
                            event.currentTarget.value as "cliproxyapi" | "codex-lb",
                          )
                        }
                      >
                        <option value="codex-lb">Codex-LB</option>
                        <option value="cliproxyapi">CLIProxyAPI</option>
                      </select>
                    </Label>
                    <Label class={fieldClass}>
                      Secret reference
                      <Input value={props.configuration.draft.secretReference} readOnly aria-readonly="true" />
                    </Label>
                  </div>
                  <Label class={fieldClass}>
                    Base URL
                    <Input
                      type="url"
                      placeholder="https://gateway.example.com/v1"
                      value={props.configuration.draft.baseUrl}
                      onInput={(event) => props.configuration.draftBaseUrlChange(event.currentTarget.value)}
                    />
                  </Label>
                  <Label class={fieldClass}>
                    Model
                    <Input
                      list="workspace-agent-models"
                      value={props.configuration.draft.model}
                      maxlength={200}
                      onInput={(event) => props.configuration.draftModelChange(event.currentTarget.value)}
                    />
                    <datalist id="workspace-agent-models">
                      <For each={props.configuration.models}>
                        {(model) => <option value={model.id}>{model.name ?? model.id}</option>}
                      </For>
                    </datalist>
                  </Label>

                  <div class="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      disabled={props.configuration.modelsStatus === "loading"}
                      onClick={() => void props.configuration.modelsDiscover()}
                    >
                      {props.configuration.modelsStatus === "loading" ? "Discovering…" : "Discover models"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={props.configuration.connectionTestStatus === "testing"}
                      onClick={() => void props.configuration.connectionTestStart()}
                    >
                      {props.configuration.connectionTestStatus === "testing" ? "Testing…" : "Test connection"}
                    </Button>
                    <Button
                      variant="contrast"
                      disabled={props.configuration.saveStatus === "saving"}
                      onClick={() => void props.configuration.save()}
                    >
                      {props.configuration.saveStatus === "saving" ? "Saving…" : "Save agent"}
                    </Button>
                  </div>
                  <Show when={props.configuration.modelsStatus === "success"}>
                    <p class="m-0 text-xs text-faint" role="status">
                      Found {props.configuration.models.length} models.
                    </p>
                  </Show>
                  <Show when={props.configuration.connectionTestStatus === "success"}>
                    <p class="m-0 text-xs text-success" role="status">
                      Connection succeeded for {props.configuration.connectionTest?.model}.
                    </p>
                  </Show>
                  <Show when={props.configuration.saveStatus === "success"}>
                    <p class="m-0 text-xs text-success" role="status">
                      Agent saved and target readiness refreshed.
                    </p>
                  </Show>
                </form>
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
