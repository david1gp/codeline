import { mdiClose } from "@adaptive-ds/mdi/mdiClose.js"
import Dialog from "@corvu/dialog"
import { Show } from "solid-js"
import { buttonCvaIconOnly, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { buttonIconCva } from "#ui/interactive/button/buttonIconCva.js"
import { classesDialogContentMerge, classesDialogOverlayMerge } from "#ui/interactive/dialog/classesDialogContent.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import { commandMenuDialogStateCreate } from "./commandMenuDialogStateCreate.js"
import type { primaryNavigationStateCreate } from "./primaryNavigationStateCreate.js"
import { SearchablePicker } from "./SearchablePicker.js"

export function CommandMenuDialog(props: {
  navigation: ReturnType<typeof primaryNavigationStateCreate>
  projectRegistry: ProjectRegistryState
}) {
  const state = commandMenuDialogStateCreate(props.navigation, props.projectRegistry)

  return (
    <Dialog
      open={state.open()}
      onOpenChange={state.openChange}
      initialFocusEl={state.searchInput() ?? undefined}
      restoreFocus={state.restoreFocus()}
    >
      <Dialog.Portal>
        <Dialog.Overlay class={classesDialogOverlayMerge()} />
        <Dialog.Content class={classesDialogContentMerge("!w-[min(92vw,36rem)]")}>
          <header class="flex items-center justify-between gap-2 mb-4">
            <div>
              <Dialog.Label class="text-lg font-semibold">Commands</Dialog.Label>
              <Dialog.Description class="text-muted-foreground">
                Search actions, projects, and sessions.
              </Dialog.Description>
            </div>
            <Dialog.Close class={buttonCvaIconOnly(buttonVariant.outline, false, false)} title="Close dialog">
              <Icon path={mdiClose} class={buttonIconCva(buttonVariant.outline, "")} />
            </Dialog.Close>
          </header>
          <SearchablePicker
            active={state.open()}
            ariaLabel="Commands"
            autofocus
            inputRef={state.searchInputSet}
            emptyText={state.isLoadingSessions() || state.isLoadingProjects() ? null : "No matching commands"}
            filterItems={false}
            idPrefix="command-menu"
            items={state.items()}
            onQueryChange={state.querySet}
            onSelect={state.itemSelect}
            placeholder="Search commands, projects, sessions…"
            selectedId={null}
          />
          <Show when={state.isLoadingProjects() || state.isLoadingSessions()}>
            <p class="m-0 pt-2 text-xs text-faint" role="status">
              Loading results…
            </p>
          </Show>
          <Show when={state.isProjectError() || state.isSessionError()}>
            <p class="m-0 pt-2 text-xs text-danger" role="status">
              Some results could not be loaded.
            </p>
          </Show>
          <Show when={state.hasMoreSessions()}>
            <button
              type="button"
              class="mt-2 w-full rounded-md px-3 py-2 text-sm text-accent hover:bg-surface-hover"
              onClick={state.loadMoreSessions}
            >
              Load more sessions
            </button>
          </Show>
          <p class="m-0 pt-3 text-xs text-faint">
            ↑ ↓ to navigate · Enter to open · {state.hasMoreSessions() ? "Tab to load more sessions · " : ""}Esc to
            close
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
