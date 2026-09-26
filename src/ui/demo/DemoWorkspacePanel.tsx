import { For, Match, Show, Switch } from "solid-js"
import type { DemoWorkspaceFixture } from "./demoWorkspaceFixture.js"
import type { demoWorkspacePanelStateCreate } from "./demoWorkspacePanelStateCreate.js"

export function DemoWorkspacePanel(props: {
  fixture: DemoWorkspaceFixture
  state: ReturnType<typeof demoWorkspacePanelStateCreate>
}) {
  const state = props.state

  return (
    <div class="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] bg-surface-sunken">
      <section class="border-line border-b" aria-label="Project file tree">
        <div class="flex h-9 items-center gap-1 border-line-subtle border-b px-2">
          <strong class="mr-auto text-xs">Project files</strong>
          <button type="button" onClick={state.uploadOpen} class="rounded px-2 py-1 text-[10px] hover:bg-accent-soft">
            ↑ Upload
          </button>
          <button type="button" onClick={state.refresh} class="rounded px-2 py-1 text-[10px] hover:bg-accent-soft">
            ↻ Refresh
          </button>
          <button type="button" onClick={state.collapseAll} class="rounded px-2 py-1 text-[10px] hover:bg-accent-soft">
            Collapse
          </button>
        </div>
        <div class="max-h-[205px] overflow-auto p-1.5" tabindex="0">
          <For each={props.fixture.tree}>
            {(item) => (
              <Show when={props.state.treeItemVisible(item.parentId)}>
                <button
                  type="button"
                  class="flex h-7 w-full items-center gap-2 rounded border-0 bg-transparent pr-2 text-left text-xs hover:bg-surface-hover"
                  classList={{ "bg-accent-soft": item.tabId === props.state.activeTabId() }}
                  style={{ "padding-left": `${7 + item.depth * 14}px` }}
                  onClick={() =>
                    item.kind === "directory"
                      ? props.state.directoryToggle(item.id)
                      : item.tabId && props.state.tabSelect(item.tabId)
                  }
                >
                  <span class="w-3 shrink-0 font-mono text-[10px] text-faint">
                    {item.kind === "directory"
                      ? props.state.expandedDirectories().includes(item.id)
                        ? "▾"
                        : "▸"
                      : "·"}
                  </span>
                  <span class="min-w-0 flex-1 truncate">{item.label}</span>
                  <Show when={item.status}>
                    <span
                      class="rounded px-1 font-mono text-[9px] font-bold"
                      classList={{
                        "bg-danger-soft text-danger": item.status === "conflict",
                        "bg-success-soft text-success": item.status === "added" || item.status === "uploaded",
                        "bg-warning-soft text-warning": item.status === "modified",
                        "bg-surface-hover text-faint": item.status === "untracked",
                      }}
                    >
                      {item.status === "added"
                        ? "A"
                        : item.status === "modified"
                          ? "M"
                          : item.status === "conflict"
                            ? "UU"
                            : item.status === "uploaded"
                              ? "UP"
                              : "?"}
                    </span>
                  </Show>
                </button>
              </Show>
            )}
          </For>
        </div>
      </section>

      <nav class="flex h-9 min-w-0 overflow-x-auto border-line border-b bg-muted" aria-label="Open files">
        <For each={props.fixture.tabs}>
          {(tab) => (
            <button
              type="button"
              onClick={() => props.state.tabSelect(tab.id)}
              class="flex min-w-[112px] max-w-[170px] shrink-0 items-center gap-2 border-0 border-line border-r bg-transparent px-3 text-left text-[11px] text-faint"
              classList={{ "bg-surface font-semibold text-strong": tab.id === props.state.activeTabId() }}
              aria-current={tab.id === props.state.activeTabId() ? "page" : undefined}
            >
              <span
                class="size-1.5 shrink-0 rounded-full bg-placeholder"
                classList={{
                  "bg-danger": tab.status === "conflict",
                  "bg-success-solid": tab.status === "added",
                  "bg-warning": tab.status === "modified",
                }}
              />
              <span class="min-w-0 flex-1 truncate">{tab.label}</span>
            </button>
          )}
        </For>
      </nav>

      <section
        class="grid min-h-[330px] grid-rows-[auto_minmax(0,1fr)_auto] bg-code-preview text-code-preview-foreground"
        aria-label="File viewer"
      >
        <div class="flex min-h-10 flex-wrap items-center gap-2 border-code-preview-line border-b px-3 py-1.5 font-mono text-[9px] text-code-preview-muted">
          <span class="min-w-0 flex-1 truncate" title={state.tab()?.path}>
            {state.tab()?.path}
          </span>
          <span>{state.tab()?.language}</span>
          <Show when={state.tab()?.kind !== "source"}>
            <button
              type="button"
              class="rounded border border-code-preview-line px-1.5 py-1"
              classList={{ "bg-code-preview-selected text-code-preview-foreground": state.mode() === "preview" }}
              onClick={() => state.modeSelect("preview")}
              aria-pressed={state.mode() === "preview"}
            >
              Preview
            </button>
          </Show>
          <button
            type="button"
            class="rounded border border-code-preview-line px-1.5 py-1"
            classList={{ "bg-code-preview-selected text-code-preview-foreground": state.mode() === "source" }}
            onClick={() => state.modeSelect("source")}
            aria-pressed={state.mode() === "source"}
          >
            Source
          </button>
          <Show when={state.tab()?.diff}>
            <button
              type="button"
              class="rounded border border-code-preview-line px-1.5 py-1"
              classList={{ "bg-code-preview-selected text-code-preview-foreground": state.mode() === "diff" }}
              onClick={() => state.modeSelect("diff")}
              aria-pressed={state.mode() === "diff"}
            >
              Diff
            </button>
          </Show>
          <button
            type="button"
            onClick={state.mentionInsert}
            class="rounded border border-code-preview-line px-1.5 py-1 text-code-preview-accent"
          >
            @ Mention
          </button>
          <button
            type="button"
            onClick={state.downloadPrepare}
            class="rounded border border-code-preview-line px-1.5 py-1"
          >
            ↓ Download
          </button>
        </div>

        <div class="min-h-0 overflow-auto" tabindex="0">
          <Switch>
            <Match when={state.mode() === "diff" && state.tab()?.diff}>
              <div class="grid min-w-[540px] grid-cols-2 divide-x divide-code-preview-line font-mono text-[10px] leading-6">
                <div>
                  <div class="sticky top-0 bg-code-preview-raised px-3 text-code-preview-muted">HEAD</div>
                  <For each={state.tab()?.diff?.left}>
                    {(line) => (
                      <div
                        class="grid grid-cols-[32px_1fr]"
                        classList={{ "bg-diff-removed-soft text-diff-removed": line.kind === "removed" }}
                      >
                        <span class="border-code-preview-line border-r px-2 text-right text-code-preview-muted">
                          {line.number}
                        </span>
                        <code class="whitespace-pre px-2">
                          {line.kind === "removed" ? "− " : "  "}
                          {line.text}
                        </code>
                      </div>
                    )}
                  </For>
                </div>
                <div>
                  <div class="sticky top-0 bg-code-preview-raised px-3 text-code-preview-muted">Working tree</div>
                  <For each={state.tab()?.diff?.right}>
                    {(line) => (
                      <div
                        class="grid grid-cols-[32px_1fr]"
                        classList={{ "bg-diff-added-soft text-diff-added": line.kind === "added" }}
                      >
                        <span class="border-code-preview-line border-r px-2 text-right text-code-preview-muted">
                          {line.number}
                        </span>
                        <code class="whitespace-pre px-2">
                          {line.kind === "added" ? "+ " : "  "}
                          {line.text}
                        </code>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Match>
            <Match when={state.mode() === "preview" && state.tab()?.kind === "markdown"}>
              <article class="min-h-full bg-surface p-5 text-strong">
                <Show when={state.tab()?.frontmatter}>
                  <dl class="mb-5 grid grid-cols-[70px_1fr] gap-x-3 gap-y-1 rounded-lg border border-line bg-surface-sunken p-3 font-mono text-[10px]">
                    <For each={state.tab()?.frontmatter}>
                      {(item) => (
                        <>
                          <dt class="text-faint">{item.key}</dt>
                          <dd class="m-0 font-semibold">{item.value}</dd>
                        </>
                      )}
                    </For>
                  </dl>
                </Show>
                <For each={state.tab()?.markdown}>
                  {(block) => (
                    <section class="mb-5">
                      <Show when={block.heading}>
                        <h2 class="m-0 mb-2 text-lg tracking-[-0.025em]">{block.heading}</h2>
                      </Show>
                      <p class="m-0 text-xs leading-6 text-subtle">{block.text}</p>
                    </section>
                  )}
                </For>
              </article>
            </Match>
            <Match when={state.mode() === "preview" && state.tab()?.kind === "mermaid"}>
              <div class="grid min-h-full place-items-center bg-surface-sunken p-5 text-strong">
                <div
                  class="flex w-full min-w-[480px] items-center justify-center gap-2"
                  role="img"
                  aria-label="Mermaid diagram preview"
                >
                  <For each={state.tab()?.mermaid?.nodes}>
                    {(node, index) => (
                      <>
                        <div
                          class="rounded-lg border px-3 py-3 text-center text-[10px] font-semibold shadow-sm"
                          classList={{
                            "border-accent-border bg-accent-soft": node.tone === "accent",
                            "border-success-border bg-success-soft": node.tone === "success",
                            "border-line-strong bg-surface": node.tone === "neutral",
                          }}
                        >
                          {node.label}
                        </div>
                        <Show when={index() < (state.tab()?.mermaid?.nodes.length ?? 0) - 1}>
                          <span class="text-lg text-faint">→</span>
                        </Show>
                      </>
                    )}
                  </For>
                </div>
              </div>
            </Match>
            <Match when={true}>
              <div class="min-w-max py-2 font-mono text-[11px] leading-6">
                <For each={state.tab()?.source}>
                  {(line, index) => (
                    <button
                      type="button"
                      onClick={() => state.lineSelect(index() + 1)}
                      class="grid w-full grid-cols-[42px_1fr] border-0 bg-transparent p-0 text-left text-code-preview-foreground hover:bg-code-preview-hover"
                      classList={{
                        "bg-code-preview-selected": Boolean(
                          state.selectedLines() &&
                            index() + 1 >= (state.selectedLines()?.[0] ?? 0) &&
                            index() + 1 <= (state.selectedLines()?.[1] ?? 0),
                        ),
                      }}
                      aria-label={`Select line ${index() + 1}`}
                    >
                      <span class="border-code-preview-line border-r px-2 text-right text-code-preview-muted">
                        {index() + 1}
                      </span>
                      <code class="whitespace-pre px-3">{line || " "}</code>
                    </button>
                  )}
                </For>
              </div>
            </Match>
          </Switch>
        </div>
        <div
          role="status"
          class="truncate border-code-preview-line border-t bg-code-preview-raised px-3 py-1.5 font-mono text-[9px] text-code-preview-muted"
        >
          {state.notice()}
        </div>
      </section>
    </div>
  )
}
