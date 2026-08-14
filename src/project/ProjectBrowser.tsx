import { For, Match, Show, Switch } from "solid-js"
import { ProjectGitPanel } from "./ProjectGitPanel.js"
import { projectBrowserStateCreate } from "./projectBrowserStateCreate.js"
import { projectByteSizeFormat } from "./projectByteSizeFormat.js"
import { projectEntryAccessibleName } from "./projectEntryAccessibleName.js"
import { projectEntryPresentationClassify } from "./projectEntryPresentationClassify.js"
import { projectModifiedAtFormat } from "./projectModifiedAtFormat.js"

export function ProjectBrowser(props: { apiBase?: string }) {
  const state = projectBrowserStateCreate({ apiBase: props.apiBase })

  return (
    <section class="grid min-h-0 min-w-0 grid-cols-1 gap-4" aria-label="Project browser">
      <h1 class="sr-only">Project files</h1>

      <ProjectGitPanel apiBase={props.apiBase} />

      <div class="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.25fr)]">
        <div class="min-h-0 rounded-xl border border-[#30342a] bg-[#171a15] p-3">
          <header class="mb-3 flex items-center gap-2 border-b border-[#30342a] pb-3">
            <button
              class="rounded-md border border-[#30342a] px-2 py-1 text-xs text-[#a4a99c] disabled:opacity-40"
              type="button"
              disabled={state.currentPath() === "" || state.directoryStatus() === "loading"}
              onClick={state.parentOpen}
            >
              Up
            </button>
            <code class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#d8ff72]">
              {state.currentPath() || "/"}
            </code>
          </header>

          <Switch>
            <Match when={state.directoryStatus() === "loading"}>
              <p class="text-xs text-[#a4a99c]" role="status">
                Loading directory...
              </p>
            </Match>
            <Match when={state.directoryStatus() === "error"}>
              <div class="flex items-center justify-between gap-3 text-xs text-[#d6a28b]" role="alert">
                <span>Couldn't load this directory.</span>
                <button class="text-[#d8ff72]" type="button" onClick={state.retryDirectory}>
                  Retry
                </button>
              </div>
            </Match>
            <Match when={state.entries().length === 0}>
              <p class="text-xs text-[#a4a99c]">This directory is empty.</p>
            </Match>
            <Match when={true}>
              <ul class="m-0 grid list-none gap-1 p-0" aria-label="Project directory entries">
                <For each={state.entries()}>
                  {(entry) => {
                    const presentation = projectEntryPresentationClassify(entry)
                    return (
                      <li>
                        <button
                          class="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[#a4a99c] hover:bg-[#22261e] hover:text-[#ebece5]"
                          classList={{ "bg-[#2b341c] text-[#d8ff72]": state.selectedFile()?.path === entry.path }}
                          type="button"
                          disabled={entry.type === "other"}
                          aria-label={projectEntryAccessibleName(entry)}
                          onClick={() =>
                            entry.type === "directory" ? state.directoryOpen(entry) : state.fileOpen(entry)
                          }
                        >
                          <span
                            class="rounded border border-[#30342a] bg-[#11130f] px-1 py-0.5 text-center font-mono text-[9px] text-[#d8ff72]"
                            aria-hidden="true"
                          >
                            {presentation.marker}
                          </span>
                          <span class="min-w-0">
                            <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-[#ebece5]">
                              {entry.name}
                            </span>
                            <span class="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[#9da392]">
                              {presentation.label}
                              {entry.type === "file" ? ` | ${projectByteSizeFormat(entry.size)}` : ""}
                              {` | ${projectModifiedAtFormat(entry.modifiedAt)}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </Match>
          </Switch>
        </div>

        <div class="min-h-[16rem] min-w-0 overflow-hidden rounded-xl border border-[#30342a] bg-[#11130f]">
          <Show when={state.tabs().length > 0}>
            <nav class="flex min-w-0 overflow-x-auto border-b border-[#30342a]" aria-label="Open project files">
              <For each={state.tabs()}>
                {(tab) => (
                  <div
                    class="flex shrink-0 items-center border-r border-[#30342a] text-xs text-[#a4a99c]"
                    classList={{ "bg-[#22261e] text-[#ebece5]": state.selectedFile()?.path === tab.path }}
                  >
                    <button class="max-w-48 truncate px-3 py-2" type="button" onClick={() => state.tabSelect(tab.path)}>
                      {tab.path.split("/").at(-1)}
                    </button>
                    <button
                      class="mr-1 rounded px-1.5 py-1 hover:bg-[#30342a] hover:text-[#ebece5]"
                      type="button"
                      aria-label={`Close ${tab.path}`}
                      onClick={() => state.tabClose(tab.path)}
                    >
                      x
                    </button>
                  </div>
                )}
              </For>
            </nav>
          </Show>
          <div class="p-3">
            <Show
              when={state.selectedFile()}
              fallback={<p class="text-xs text-[#a4a99c]">Select a file to preview it.</p>}
            >
              {(file) => (
                <>
                  <header class="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#30342a] pb-3">
                    <div class="min-w-0">
                      <code class="block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#ebece5]">
                        {file().path}
                      </code>
                      <Show when={state.preview()}>
                        {(preview) => (
                          <span class="mt-1 block text-[10px] text-[#9da392]">
                            {preview().mimeType} | {projectByteSizeFormat(preview().size)}
                          </span>
                        )}
                      </Show>
                    </div>
                    <div class="flex items-center gap-3">
                      <Show when={state.isMarkdownPreview()}>
                        {/* biome-ignore lint/a11y/useSemanticElements: Toggle buttons use aria-pressed, not form controls. */}
                        <div
                          class="flex rounded-md border border-[#30342a] p-0.5"
                          role="group"
                          aria-label="Markdown display mode"
                        >
                          <For each={["source", "preview"] as const}>
                            {(mode) => (
                              <button
                                class="rounded px-2 py-1 text-[10px] capitalize text-[#a4a99c]"
                                classList={{ "bg-[#30342a] text-[#ebece5]": state.displayMode() === mode }}
                                type="button"
                                aria-pressed={state.displayMode() === mode}
                                onClick={() => state.displayModeSelect(mode)}
                              >
                                {mode}
                              </button>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={state.downloadUrl()}>
                        {(url) => (
                          <a class="text-xs text-[#d8ff72]" href={url()} download={file().name}>
                            Download
                          </a>
                        )}
                      </Show>
                    </div>
                  </header>
                  <Switch>
                    <Match when={state.previewStatus() === "loading"}>
                      <p class="text-xs text-[#a4a99c]" role="status">
                        Loading preview...
                      </p>
                    </Match>
                    <Match when={state.previewStatus() === "error"}>
                      <div class="flex items-center justify-between gap-3 text-xs text-[#d6a28b]" role="alert">
                        <span>This file can't be previewed. You can still download it.</span>
                        <button class="text-[#d8ff72]" type="button" onClick={state.retryPreview}>
                          Retry
                        </button>
                      </div>
                    </Match>
                    <Match when={state.isMarkdownPreview() && state.displayMode() === "preview"}>
                      <section
                        class="markdown-content markdown-content--preview max-h-[70vh] overflow-auto"
                        tabindex="0"
                        aria-label={`Markdown preview of ${file().name}`}
                        innerHTML={state.markdownPreviewHtml()}
                      />
                    </Match>
                    <Match when={state.textPreview()}>
                      {(preview) => (
                        <pre
                          class="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[#c8cbc1]"
                          tabindex="0"
                        >
                          {preview().content}
                        </pre>
                      )}
                    </Match>
                    <Match when={state.imagePreview()}>
                      {(image) => (
                        <img
                          class="max-h-[70vh] max-w-full rounded-lg object-contain"
                          src={image().url}
                          alt={`Preview of ${file().name}`}
                        />
                      )}
                    </Match>
                    <Match when={state.pdfPreview()}>
                      {(pdf) => (
                        <iframe
                          class="h-[70vh] w-full rounded-lg border-0 bg-white"
                          src={pdf().url}
                          title={`PDF preview of ${file().name}`}
                        />
                      )}
                    </Match>
                    <Match when={state.preview()?.kind === "unsupported"}>
                      <p class="text-xs text-[#a4a99c]" role="status">
                        Preview unavailable for this file type. Download the file to open it.
                      </p>
                    </Match>
                  </Switch>
                </>
              )}
            </Show>
          </div>
        </div>
      </div>
    </section>
  )
}
