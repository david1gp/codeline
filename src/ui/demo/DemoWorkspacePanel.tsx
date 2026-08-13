import { For, Match, Show, Switch } from "solid-js"
import type { DemoWorkspaceFixture } from "./demoWorkspaceFixture.js"
import { demoWorkspacePanelStateCreate } from "./demoWorkspacePanelStateCreate.js"

export function DemoWorkspacePanel(props: { fixture: DemoWorkspaceFixture }) {
  const state = demoWorkspacePanelStateCreate(() => props.fixture)

  return (
    <div class="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] bg-[#fafbfc]">
      <section class="border-[#d8dce3] border-b" aria-label="Project file tree">
        <div class="flex h-9 items-center gap-1 border-[#e5e8ed] border-b px-2">
          <strong class="mr-auto text-xs">Project files</strong>
          <button type="button" onClick={state.uploadOpen} class="rounded px-2 py-1 text-[10px] hover:bg-[#e8eefb]">
            ↑ Upload
          </button>
          <button type="button" onClick={state.refresh} class="rounded px-2 py-1 text-[10px] hover:bg-[#e8eefb]">
            ↻ Refresh
          </button>
          <button type="button" onClick={state.collapseAll} class="rounded px-2 py-1 text-[10px] hover:bg-[#e8eefb]">
            Collapse
          </button>
        </div>
        <div class="max-h-[205px] overflow-auto p-1.5" tabindex="0">
          <For each={props.fixture.tree}>
            {(item) => (
              <Show when={state.treeItemVisible(item.parentId)}>
                <button
                  type="button"
                  class="flex h-7 w-full items-center gap-2 rounded border-0 bg-transparent pr-2 text-left text-xs hover:bg-[#eef1f5]"
                  classList={{ "bg-[#e8eefb]": item.tabId === state.activeTabId() }}
                  style={{ "padding-left": `${7 + item.depth * 14}px` }}
                  onClick={() =>
                    item.kind === "directory"
                      ? state.directoryToggle(item.id)
                      : item.tabId && state.tabSelect(item.tabId)
                  }
                >
                  <span class="w-3 shrink-0 font-mono text-[10px] text-[#5f6879]">
                    {item.kind === "directory" ? (state.expandedDirectories().includes(item.id) ? "▾" : "▸") : "·"}
                  </span>
                  <span class="min-w-0 flex-1 truncate">{item.label}</span>
                  <Show when={item.status}>
                    <span
                      class="rounded px-1 font-mono text-[9px] font-bold"
                      classList={{
                        "bg-[#fff0f0] text-[#ad3838]": item.status === "conflict",
                        "bg-[#edf8f1] text-[#1f7047]": item.status === "added" || item.status === "uploaded",
                        "bg-[#fff7e7] text-[#a86c12]": item.status === "modified",
                        "bg-[#eef1f5] text-[#5f6879]": item.status === "untracked",
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

      <nav class="flex h-9 min-w-0 overflow-x-auto border-[#d8dce3] border-b bg-[#f0f2f5]" aria-label="Open files">
        <For each={props.fixture.tabs}>
          {(tab) => (
            <button
              type="button"
              onClick={() => state.tabSelect(tab.id)}
              class="flex min-w-[112px] max-w-[170px] shrink-0 items-center gap-2 border-0 border-[#d8dce3] border-r bg-transparent px-3 text-left text-[11px] text-[#5f6879]"
              classList={{ "bg-white font-semibold text-[#18202b]": tab.id === state.activeTabId() }}
              aria-current={tab.id === state.activeTabId() ? "page" : undefined}
            >
              <span
                class="size-1.5 shrink-0 rounded-full bg-[#8b94a3]"
                classList={{
                  "bg-[#ad3838]": tab.status === "conflict",
                  "bg-[#248451]": tab.status === "added",
                  "bg-[#b77719]": tab.status === "modified",
                }}
              />
              <span class="min-w-0 flex-1 truncate">{tab.label}</span>
            </button>
          )}
        </For>
      </nav>

      <section
        class="grid min-h-[330px] grid-rows-[auto_minmax(0,1fr)_auto] bg-[#202734] text-[#d8dee9]"
        aria-label="File viewer"
      >
        <div class="flex min-h-10 flex-wrap items-center gap-2 border-[#394252] border-b px-3 py-1.5 font-mono text-[9px] text-[#9da8b8]">
          <span class="min-w-0 flex-1 truncate" title={state.tab()?.path}>
            {state.tab()?.path}
          </span>
          <span>{state.tab()?.language}</span>
          <Show when={state.tab()?.kind !== "source"}>
            <button
              type="button"
              class="rounded border border-[#4c5668] px-1.5 py-1"
              classList={{ "bg-[#405170] text-white": state.mode() === "preview" }}
              onClick={() => state.modeSelect("preview")}
              aria-pressed={state.mode() === "preview"}
            >
              Preview
            </button>
          </Show>
          <button
            type="button"
            class="rounded border border-[#4c5668] px-1.5 py-1"
            classList={{ "bg-[#405170] text-white": state.mode() === "source" }}
            onClick={() => state.modeSelect("source")}
            aria-pressed={state.mode() === "source"}
          >
            Source
          </button>
          <Show when={state.tab()?.diff}>
            <button
              type="button"
              class="rounded border border-[#4c5668] px-1.5 py-1"
              classList={{ "bg-[#405170] text-white": state.mode() === "diff" }}
              onClick={() => state.modeSelect("diff")}
              aria-pressed={state.mode() === "diff"}
            >
              Diff
            </button>
          </Show>
          <button
            type="button"
            onClick={state.mentionInsert}
            class="rounded border border-[#4c5668] px-1.5 py-1 text-[#9cc0ff]"
          >
            @ Mention
          </button>
          <button type="button" onClick={state.downloadPrepare} class="rounded border border-[#4c5668] px-1.5 py-1">
            ↓ Download
          </button>
        </div>

        <div class="min-h-0 overflow-auto" tabindex="0">
          <Switch>
            <Match when={state.mode() === "diff" && state.tab()?.diff}>
              <div class="grid min-w-[540px] grid-cols-2 divide-x divide-[#394252] font-mono text-[10px] leading-6">
                <div>
                  <div class="sticky top-0 bg-[#29313f] px-3 text-[#9da8b8]">HEAD</div>
                  <For each={state.tab()?.diff?.left}>
                    {(line) => (
                      <div
                        class="grid grid-cols-[32px_1fr]"
                        classList={{ "bg-[#492f36] text-[#ffc1c8]": line.kind === "removed" }}
                      >
                        <span class="border-[#394252] border-r px-2 text-right text-[#9da8b8]">{line.number}</span>
                        <code class="whitespace-pre px-2">
                          {line.kind === "removed" ? "− " : "  "}
                          {line.text}
                        </code>
                      </div>
                    )}
                  </For>
                </div>
                <div>
                  <div class="sticky top-0 bg-[#29313f] px-3 text-[#9da8b8]">Working tree</div>
                  <For each={state.tab()?.diff?.right}>
                    {(line) => (
                      <div
                        class="grid grid-cols-[32px_1fr]"
                        classList={{ "bg-[#263f38] text-[#aff0c9]": line.kind === "added" }}
                      >
                        <span class="border-[#394252] border-r px-2 text-right text-[#9da8b8]">{line.number}</span>
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
              <article class="min-h-full bg-white p-5 text-[#263142]">
                <Show when={state.tab()?.frontmatter}>
                  <dl class="mb-5 grid grid-cols-[70px_1fr] gap-x-3 gap-y-1 rounded-lg border border-[#d8dce3] bg-[#f6f8fa] p-3 font-mono text-[10px]">
                    <For each={state.tab()?.frontmatter}>
                      {(item) => (
                        <>
                          <dt class="text-[#5f6879]">{item.key}</dt>
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
                      <p class="m-0 text-xs leading-6 text-[#536074]">{block.text}</p>
                    </section>
                  )}
                </For>
              </article>
            </Match>
            <Match when={state.mode() === "preview" && state.tab()?.kind === "mermaid"}>
              <div class="grid min-h-full place-items-center bg-[#f7f8fa] p-5 text-[#263142]">
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
                            "border-[#9ab6e5] bg-[#eaf1fc]": node.tone === "accent",
                            "border-[#a9d3b9] bg-[#edf8f1]": node.tone === "success",
                            "border-[#ccd2dc] bg-white": node.tone === "neutral",
                          }}
                        >
                          {node.label}
                        </div>
                        <Show when={index() < (state.tab()?.mermaid?.nodes.length ?? 0) - 1}>
                          <span class="text-lg text-[#7b8798]">→</span>
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
                      class="grid w-full grid-cols-[42px_1fr] border-0 bg-transparent p-0 text-left text-[#d8dee9] hover:bg-[#2a3342]"
                      classList={{
                        "bg-[#33425b]": Boolean(
                          state.selectedLines() &&
                            index() + 1 >= (state.selectedLines()?.[0] ?? 0) &&
                            index() + 1 <= (state.selectedLines()?.[1] ?? 0),
                        ),
                      }}
                      aria-label={`Select line ${index() + 1}`}
                    >
                      <span class="border-[#394252] border-r px-2 text-right text-[#9da8b8]">{index() + 1}</span>
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
          class="truncate border-[#394252] border-t bg-[#29313f] px-3 py-1.5 font-mono text-[9px] text-[#aab4c2]"
        >
          {state.notice()}
        </div>
      </section>
    </div>
  )
}
