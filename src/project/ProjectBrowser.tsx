import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import { For, Match, Show, Switch } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { ProjectGitPanel } from "./ProjectGitPanel.js"
import type { ProjectBrowserView } from "./projectBrowserView.js"
import { projectByteSizeFormat } from "./projectByteSizeFormat.js"
import { projectEntryAccessibleName } from "./projectEntryAccessibleName.js"
import { projectEntryPresentationClassify } from "./projectEntryPresentationClassify.js"
import { projectModifiedAtFormat } from "./projectModifiedAtFormat.js"

export function ProjectBrowser(props: { compact?: boolean; state: ProjectBrowserView }) {
  const state = props.state

  return (
    <section
      class="grid min-h-0 min-w-0 grid-cols-1"
      classList={{ "gap-4": !props.compact, "h-full": props.compact }}
      aria-label="Project browser"
    >
      <Show when={!props.compact}>
        <ProjectGitPanel state={state.git} />
      </Show>

      <div
        class="grid min-h-0 grid-cols-1"
        classList={{
          "gap-4 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.25fr)]": !props.compact,
          "h-full grid-rows-[minmax(10rem,2fr)_minmax(12rem,3fr)]": props.compact,
        }}
      >
        <div
          class="min-h-0 border-line bg-surface p-3"
          classList={{
            "overflow-auto border-b": props.compact,
            "rounded-xl border": !props.compact,
          }}
        >
          <header class="mb-3 flex items-center gap-2 border-b border-line pb-3">
            <Button
              class="rounded-md border border-line px-2 py-1 text-xs text-subtle hover:bg-surface-hover hover:text-strong disabled:border-disabled-border disabled:text-disabled disabled:hover:bg-transparent"
              variant="none"
              size="none"
              disabled={state.currentPath() === "" || state.directoryStatus() === "loading"}
              onClick={state.parentOpen}
            >
              Up
            </Button>
            <code class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-accent">
              {state.currentPath() || "/"}
            </code>
          </header>

          <Switch>
            <Match when={state.directoryStatus() === "loading"}>
              <p class="text-xs text-faint" role="status">
                Loading directory...
              </p>
            </Match>
            <Match when={state.directoryStatus() === "error"}>
              <div class="flex items-center justify-between gap-3 text-xs text-danger" role="alert">
                <span>Couldn't load this directory.</span>
                <Button variant="none" size="none" class="text-accent" onClick={state.retryDirectory}>
                  Retry
                </Button>
              </div>
            </Match>
            <Match when={state.entries().length === 0}>
              <p class="text-xs text-faint">This directory is empty.</p>
            </Match>
            <Match when={true}>
              <ul class="m-0 grid list-none gap-1 p-0" aria-label="Project directory entries">
                <For each={state.entries()}>
                  {(entry) => {
                    const presentation = projectEntryPresentationClassify(entry)
                    return (
                      <li>
                        <Button
                          variant="none"
                          size="none"
                          class="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-faint hover:bg-surface-raised hover:text-strong"
                          classList={{ "bg-accent-soft text-accent": state.selectedFile()?.path === entry.path }}
                          disabled={entry.type === "other"}
                          aria-label={projectEntryAccessibleName(entry)}
                          onClick={() =>
                            entry.type === "directory" ? state.directoryOpen(entry) : state.fileOpen(entry)
                          }
                        >
                          <span
                            class="rounded border border-line bg-surface-sunken px-1 py-0.5 text-center font-mono text-[9px] text-accent"
                            aria-hidden="true"
                          >
                            {presentation.marker}
                          </span>
                          <span class="min-w-0">
                            <span class="block overflow-hidden text-ellipsis whitespace-nowrap text-strong">
                              {entry.name}
                            </span>
                            <span class="mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-faint">
                              {presentation.label}
                              {entry.type === "file" ? ` | ${projectByteSizeFormat(entry.size)}` : ""}
                              {` | ${projectModifiedAtFormat(entry.modifiedAt)}`}
                            </span>
                          </span>
                        </Button>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </Match>
          </Switch>
        </div>

        <div
          class="min-w-0 overflow-hidden border-line bg-surface-sunken"
          classList={{
            "min-h-0 flex flex-col": props.compact,
            "min-h-[16rem] rounded-xl border": !props.compact,
          }}
        >
          <Show when={state.tabs().length > 0}>
            <nav class="flex min-w-0 overflow-x-auto border-b border-line" aria-label="Open project files">
              <For each={state.tabs()}>
                {(tab) => (
                  <div
                    class="flex shrink-0 items-center border-r border-line text-xs text-faint"
                    classList={{ "bg-surface-raised text-strong": state.selectedFile()?.path === tab.path }}
                  >
                    <Button
                      variant="none"
                      size="none"
                      class="max-w-48 truncate px-3 py-2"
                      onClick={() => state.tabSelect(tab.path)}
                    >
                      {tab.path.split("/").at(-1)}
                    </Button>
                    <ButtonIconOnly
                      class="mr-1 rounded p-1 hover:bg-line hover:text-strong"
                      icon={mdiClose}
                      iconClass="size-3 fill-current dark:fill-current"
                      variant="none"
                      aria-label={`Close ${tab.path}`}
                      title={`Close ${tab.path}`}
                      onClick={() => state.tabClose(tab.path)}
                    />
                  </div>
                )}
              </For>
            </nav>
          </Show>
          <div class="p-3" classList={{ "min-h-0 flex-1 overflow-auto": props.compact }}>
            <Show when={state.selectedFile()} fallback={<p class="text-xs text-faint">Select a file to preview it.</p>}>
              {(file) => (
                <>
                  <header class="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                    <div class="min-w-0">
                      <code class="block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-strong">
                        {file().path}
                      </code>
                      <Show when={state.preview()}>
                        {(preview) => (
                          <span class="mt-1 block text-[10px] text-faint">
                            {preview().mimeType} | {projectByteSizeFormat(preview().size)}
                          </span>
                        )}
                      </Show>
                    </div>
                    <div class="flex items-center gap-3">
                      <Show when={state.isMarkdownPreview()}>
                        {/* biome-ignore lint/a11y/useSemanticElements: Toggle buttons use aria-pressed, not form controls. */}
                        <div
                          class="flex rounded-md border border-line p-0.5"
                          role="group"
                          aria-label="Markdown display mode"
                        >
                          <For each={["source", "preview"] as const}>
                            {(mode) => (
                              <Button
                                variant="none"
                                size="none"
                                class="rounded px-2 py-1 text-[10px] capitalize text-faint"
                                classList={{ "bg-line text-strong": state.displayMode() === mode }}
                                aria-pressed={state.displayMode() === mode}
                                onClick={() => state.displayModeSelect(mode)}
                              >
                                {mode}
                              </Button>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={state.downloadUrl()}>
                        {(url) => (
                          <a class="text-xs text-accent" href={url()} download={file().name}>
                            Download
                          </a>
                        )}
                      </Show>
                    </div>
                  </header>
                  <Switch>
                    <Match when={state.previewStatus() === "loading"}>
                      <p class="text-xs text-faint" role="status">
                        Loading preview...
                      </p>
                    </Match>
                    <Match when={state.previewStatus() === "error"}>
                      <div class="flex items-center justify-between gap-3 text-xs text-danger" role="alert">
                        <span>This file can't be previewed. You can still download it.</span>
                        <Button variant="none" size="none" class="text-accent" onClick={state.retryPreview}>
                          Retry
                        </Button>
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
                          class="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-subtle"
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
                          class="h-[70vh] w-full rounded-lg border-0 bg-surface"
                          src={pdf().url}
                          title={`PDF preview of ${file().name}`}
                        />
                      )}
                    </Match>
                    <Match when={state.preview()?.kind === "unsupported"}>
                      <p class="text-xs text-faint" role="status">
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
