import { For, Show } from "solid-js"
import { Details } from "#ui/interactive/details/Details.jsx"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

const sectionClass = "grid gap-2 px-4 pb-4 text-xs text-faint"
const rowClass = "grid gap-0.5 rounded-md border border-line-subtle bg-surface px-2.5 py-1.5"

export function SkillCatalogInspector(props: { state: SessionResourceSelectorView }) {
  return (
    <section class="grid gap-3" aria-label="Resource inspector">
      <Details class="!bg-surface-raised !border-line" summaryClass="!p-3" title="Skill roots and groups">
        <div class={sectionClass}>
          <For each={props.state.roots()}>
            {(root) => (
              <p class={rowClass}>
                <span class="font-semibold text-strong">{root.path}</span>
                <span>
                  {root.source} · precedence {root.precedence}
                </span>
              </p>
            )}
          </For>
          <Show when={props.state.groups().length > 0}>
            <p class="m-0 mt-1 font-semibold text-strong">Groups</p>
            <ul class="m-0 grid list-none gap-1 p-0">
              <For each={props.state.groups()}>
                {(group) => (
                  <li class={rowClass}>
                    <span>{group.path}</span>
                    <span>{group.source}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </Details>

      <Details class="!bg-surface-raised !border-line" summaryClass="!p-3" title="Skill bundles">
        <div class={sectionClass}>
          <Show when={props.state.skillBundles().length === 0}>
            <p class="m-0">No skill bundles were discovered.</p>
          </Show>
          <For each={props.state.skillBundles()}>
            {(bundle) => (
              <Details class="!bg-surface !border-line-subtle" summaryClass="!p-2.5" title={bundle.name}>
                <div class="grid gap-1.5 px-3 pb-3">
                  <p class="m-0 text-strong">{bundle.description}</p>
                  <p class="m-0">
                    {bundle.source} · {bundle.bundlePath} · {bundle.size} bytes
                  </p>
                  <p class="m-0 font-mono text-[10px] break-all">{bundle.digest}</p>
                  <Show when={bundle.resources.length > 0}>
                    <p class="m-0 mt-1 font-semibold text-strong">Resources</p>
                    <ul class="m-0 grid list-none gap-1 p-0">
                      <For each={bundle.resources}>
                        {(resource) => (
                          <li class="m-0">
                            {resource.path} · {resource.size} bytes
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                  <details class="mt-1">
                    <summary class="cursor-pointer text-accent">Show SKILL.md content</summary>
                    <pre class="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] whitespace-pre-wrap">
                      {bundle.content}
                    </pre>
                  </details>
                </div>
              </Details>
            )}
          </For>
        </div>
      </Details>

      <Show when={props.state.collisions().length > 0}>
        <Details class="!bg-surface-raised !border-line" summaryClass="!p-3" title="Name collisions">
          <div class={sectionClass}>
            <For each={props.state.collisions()}>
              {(collision) => (
                <div class={rowClass}>
                  <span class="font-semibold text-strong">{collision.name}</span>
                  <span>
                    winner: {collision.winner.source} · {collision.winner.bundlePath}
                  </span>
                  <For each={collision.candidates}>
                    {(candidate) => (
                      <span>
                        candidate: {candidate.source} · {candidate.bundlePath}
                      </span>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Details>
      </Show>

      <Show
        when={
          props.state.diagnostics().length > 0 ||
          props.state.presetDiagnostics().length > 0 ||
          props.state.missingSkillNames().length > 0 ||
          props.state.missingFolderPaths().length > 0
        }
      >
        <Details class="!bg-surface-raised !border-line" summaryClass="!p-3" title="Validation">
          <div class={sectionClass} role="status">
            <For each={props.state.diagnostics()}>
              {(diagnostic) => (
                <p class={`${rowClass} text-danger`}>
                  <span class="font-semibold">{diagnostic.code}</span>
                  <span>{diagnostic.message}</span>
                  <span>{diagnostic.relativePath}</span>
                </p>
              )}
            </For>
            <For each={props.state.presetDiagnostics()}>
              {(diagnostic) => (
                <p class={`${rowClass} text-danger`}>
                  <span class="font-semibold">{diagnostic.code}</span>
                  <span>{diagnostic.message}</span>
                  <span>{diagnostic.relativePath}</span>
                </p>
              )}
            </For>
            <Show when={props.state.missingSkillNames().length > 0}>
              <p class="m-0">Preset references unknown skills: {props.state.missingSkillNames().join(", ")}</p>
            </Show>
            <Show when={props.state.missingFolderPaths().length > 0}>
              <p class="m-0">Preset references unknown folders: {props.state.missingFolderPaths().join(", ")}</p>
            </Show>
          </div>
        </Details>
      </Show>

      <Details class="!bg-surface-raised !border-line" summaryClass="!p-3" title="Instruction sources">
        <div class={sectionClass}>
          <Show when={props.state.instructionSnapshots().length === 0}>
            <p class="m-0">No AGENTS.md instructions were discovered.</p>
          </Show>
          <For each={props.state.instructionSnapshots()}>
            {(snapshot) => (
              <p class={rowClass}>
                <span class="font-semibold text-strong">{snapshot.path}</span>
                <span>
                  {snapshot.source} · scope {snapshot.scope} · {snapshot.size} bytes
                </span>
                <span class="font-mono text-[10px] break-all">{snapshot.digest}</span>
              </p>
            )}
          </For>
          <For each={props.state.instructionDiagnostics()}>
            {(diagnostic) => (
              <p class={`${rowClass} text-danger`} role="alert">
                <span class="font-semibold">{diagnostic.code}</span>
                <span>{diagnostic.message}</span>
                <span>{diagnostic.path}</span>
              </p>
            )}
          </For>
        </div>
      </Details>
    </section>
  )
}
