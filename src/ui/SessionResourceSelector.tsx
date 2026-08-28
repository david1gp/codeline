import { For, Match, Show, Switch } from "solid-js"
import { Checkbox } from "#ui/input/check/Checkbox.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { Details } from "#ui/interactive/details/Details.jsx"
import { SessionCapturedContextInspector } from "./SessionCapturedContextInspector.js"
import { SkillCatalogInspector } from "./SkillCatalogInspector.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

const panelClass = "grid gap-3 rounded-xl border border-line bg-surface-raised p-4"
const captionClass = "m-0 text-[11px] font-semibold tracking-[0.14em] text-accent uppercase"

export function SessionResourceSelector(props: { idPrefix?: string; state: SessionResourceSelectorView }) {
  const prefix = () => props.idPrefix ?? "session-resources"
  const presetValueSignal = {
    get: () => props.state.presetName() ?? "",
    set: props.state.presetSelect,
  }

  return (
    <section class={panelClass} aria-labelledby={`${prefix()}-heading`}>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p class={captionClass}>Session resources</p>
          <h3 id={`${prefix()}-heading`} class="m-0 text-base font-semibold tracking-[-0.02em]">
            Skills and tools
          </h3>
        </div>
        <Show when={!props.state.isMutable()}>
          <p class="m-0 text-xs text-faint" role="status">
            Captured when this session was created and cannot be changed.
          </p>
        </Show>
      </div>

      <Switch>
        <Match when={props.state.status() === "offline"}>
          <p class="m-0 text-xs text-faint" role="status">
            Offline. Resource selection is unavailable until the connection returns.
          </p>
        </Match>

        <Match when={props.state.status() === "idle"}>
          <p class="m-0 text-xs text-faint" role="status">
            Select a project to review its skills, presets, and instruction sources.
          </p>
        </Match>

        <Match when={props.state.status() === "loading"}>
          <p class="m-0 text-xs text-faint" role="status" aria-live="polite">
            Loading skills, presets, and instruction sources...
          </p>
        </Match>

        <Match when={props.state.status() === "error"}>
          <div class="flex items-center justify-between gap-3" role="alert">
            <p class="m-0 text-xs text-danger">
              {props.state.errorMessage() ?? "The session resources could not be loaded."}
            </p>
            <Button variant="outlineRed" size="sm" onClick={props.state.retry}>
              Retry
            </Button>
          </div>
        </Match>

        <Match when={!props.state.isMutable()}>
          <SessionCapturedContextInspector idPrefix={`${prefix()}-context`} state={props.state} />
        </Match>

        <Match when={true}>
          <div class="grid gap-4">
            <label class="grid gap-1.5 text-xs font-semibold text-faint" for={`${prefix()}-preset`}>
              Skill preset
              <SelectSingleNative
                id={`${prefix()}-preset`}
                class="!rounded-md !border !border-line !bg-surface !px-2.5 !py-1.5 text-xs !text-foreground"
                valueSignal={presetValueSignal}
                getOptions={() => props.state.presets().map((preset) => preset.name)}
                valueText={(name) => props.state.presets().find((preset) => preset.name === name)?.description ?? name}
              />
              <span class="text-[11px] font-normal">
                {props.state.presetSource() === "override"
                  ? "Overridden for this session only."
                  : "Your saved default for this project."}
              </span>
            </label>

            <div class="grid gap-2">
              <p class="m-0 text-xs font-semibold text-faint">Skill folders</p>
              <Show
                when={props.state.folders().length > 0}
                fallback={<p class="m-0 text-xs text-faint">No skill folders were discovered.</p>}
              >
                <ul class="m-0 grid list-none gap-1 p-0" aria-label="Skill folders">
                  <For each={props.state.folders()}>
                    {(folder) => (
                      <li class="grid gap-1" style={{ "padding-left": `${folder.depth * 12}px` }}>
                        <Checkbox
                          id={`${prefix()}-folder-${folder.path}`}
                          class="text-xs text-strong"
                          checked={folder.selection === "all"}
                          onChange={(checked) => props.state.folderToggle(folder.path, checked)}
                        >
                          <span class="font-medium">{folder.label}</span>
                          <span class="ml-2 text-faint">
                            {folder.descendantSkillNames.length} skills
                            {folder.selection === "partial" ? " · partial" : ""}
                          </span>
                        </Checkbox>
                        <Show when={folder.skills.length > 0}>
                          <ul class="m-0 grid list-none gap-1 p-0 pl-6">
                            <For each={folder.skills}>
                              {(skill) => (
                                <li>
                                  <Checkbox
                                    id={`${prefix()}-skill-${skill.name}`}
                                    class="text-xs text-faint"
                                    checked={skill.isActive}
                                    disabled={skill.isExcluded}
                                    onChange={(checked) => props.state.skillToggle(skill.name, checked)}
                                  >
                                    <span class="text-strong">{skill.name}</span>
                                    <Show when={skill.isExcluded}>
                                      <span class="ml-2">excluded by preset</span>
                                    </Show>
                                  </Checkbox>
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>

            <div class="grid gap-2">
              <p class="m-0 text-xs font-semibold text-faint">Effective skills</p>
              <Show
                when={props.state.activeSkills().length > 0}
                fallback={<p class="m-0 text-xs text-faint">No skills are active for this session.</p>}
              >
                <ul class="m-0 grid list-none gap-1 p-0" aria-label="Effective skills">
                  <For each={props.state.activeSkills()}>
                    {(skill) => (
                      <li class="rounded-md border border-line-subtle bg-surface px-2.5 py-1.5 text-xs">
                        <span class="font-semibold text-strong">{skill.name}</span>
                        <span class="ml-2 text-faint">{skill.source}</span>
                        <p class="m-0 mt-0.5 text-faint">{skill.description}</p>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <p class="m-0 text-[11px] text-faint" role="status">
                {props.state.activeSkills().length} active skills · about{" "}
                {props.state.descriptionCatalog().estimatedTokens} tokens of catalog context (estimate)
              </p>
            </div>

            <SessionResourceToolToggles idPrefix={prefix()} state={props.state} />

            <Details
              class="!bg-surface !border-line-subtle"
              summaryClass="!p-3 !text-sm"
              title="Inspect discovered resources"
            >
              <div class="px-3 pb-3">
                <SkillCatalogInspector state={props.state} />
              </div>
            </Details>
          </div>
        </Match>
      </Switch>
    </section>
  )
}

function SessionResourceToolToggles(props: { idPrefix: string; state: SessionResourceSelectorView }) {
  return (
    <div class="grid gap-2">
      <p class="m-0 text-xs font-semibold text-faint">Agent tools</p>
      <Show
        when={props.state.agentTools().length > 0}
        fallback={<p class="m-0 text-xs text-faint">No agents are available for tool configuration.</p>}
      >
        <ul class="m-0 grid list-none gap-2 p-0" aria-label="Agent tools">
          <For each={props.state.agentTools()}>
            {(agent) => (
              <li class="grid gap-1 rounded-md border border-line-subtle bg-surface px-2.5 py-2">
                <p class="m-0 text-xs font-semibold text-strong">
                  {agent.name}
                  <span class="ml-2 font-normal text-faint">{agent.isPrimary ? "primary" : "subagent"}</span>
                </p>
                <div class="flex flex-wrap gap-4">
                  <Checkbox
                    id={`${props.idPrefix}-${agent.agentId}-bash`}
                    class="text-xs text-faint"
                    checked={agent.bash}
                    onChange={(checked) => props.state.toolToggle(agent.agentId, "bash", checked)}
                  >
                    bash
                  </Checkbox>
                  <Checkbox
                    id={`${props.idPrefix}-${agent.agentId}-webfetch`}
                    class="text-xs text-faint"
                    checked={agent.webfetch}
                    onChange={(checked) => props.state.toolToggle(agent.agentId, "webfetch", checked)}
                  >
                    webfetch
                  </Checkbox>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
