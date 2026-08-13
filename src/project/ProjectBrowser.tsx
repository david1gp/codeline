import { For, Match, Show, Switch } from "solid-js"
import { projectBrowserStateCreate } from "./projectBrowserStateCreate.js"

export function ProjectBrowser(props: { apiBase?: string }) {
  const state = projectBrowserStateCreate({ apiBase: props.apiBase })

  return (
    <section
      class="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.25fr)]"
      aria-label="Project browser"
    >
      <h1 class="sr-only">Project files</h1>

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
                {(entry) => (
                  <li>
                    <button
                      class="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs text-[#a4a99c] hover:bg-[#22261e] hover:text-[#ebece5]"
                      classList={{ "bg-[#2b341c] text-[#d8ff72]": state.selectedFile()?.path === entry.path }}
                      type="button"
                      disabled={entry.type === "other"}
                      onClick={() => (entry.type === "directory" ? state.directoryOpen(entry) : state.fileOpen(entry))}
                    >
                      <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
                      <span class="font-mono text-[10px] uppercase text-[#a4a99c]">{entry.type}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Match>
        </Switch>
      </div>

      <div class="min-h-[16rem] min-w-0 rounded-xl border border-[#30342a] bg-[#11130f] p-3">
        <Show when={state.selectedFile()} fallback={<p class="text-xs text-[#a4a99c]">Select a file to preview it.</p>}>
          {(file) => (
            <>
              <header class="mb-3 flex items-center justify-between gap-3 border-b border-[#30342a] pb-3">
                <code class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#ebece5]">
                  {file().path}
                </code>
                <Show when={state.downloadUrl()}>
                  {(url) => (
                    <a class="text-xs text-[#d8ff72]" href={url()} download={file().name}>
                      Download
                    </a>
                  )}
                </Show>
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
    </section>
  )
}
