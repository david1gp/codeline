import { For, type JSX, Show } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { applicationIcon } from "./applicationIcon.js"
import type { SearchablePickerItem } from "./searchablePickerItem.js"
import { searchablePickerStateCreate } from "./searchablePickerStateCreate.js"

export function SearchablePicker<T extends SearchablePickerItem>(props: {
  active?: boolean
  ariaLabel: string
  emptyText: string
  idPrefix: string
  items: readonly T[]
  onSelect: (item: T) => void
  placeholder: string
  renderLeading?: (item: T) => JSX.Element
  selectedId: string | null
}) {
  const state = searchablePickerStateCreate({
    active: () => props.active !== false,
    idPrefix: () => props.idPrefix,
    items: () => props.items,
    onSelect: (item) => props.onSelect(item),
    selectedId: () => props.selectedId,
  })

  return (
    <div class="grid min-w-0 gap-2">
      <div class="relative">
        <Icon
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint"
          path={applicationIcon.search}
        />
        <Input
          ref={state.inputRef}
          id={`${props.idPrefix}-search`}
          class="!w-full !pl-8"
          type="search"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={state.listboxId()}
          aria-expanded={props.active !== false}
          aria-label={props.ariaLabel}
          aria-activedescendant={state.activeDescendant()}
          placeholder={props.placeholder}
          value={state.query()}
          onInput={state.queryInput}
        />
      </div>

      <div
        id={state.listboxId()}
        class="grid max-h-[45vh] grid-cols-1 gap-1 overflow-y-auto rounded-md border border-line-subtle p-1"
        role="listbox"
        aria-label={props.ariaLabel}
      >
        <For
          each={state.filteredItems()}
          fallback={
            <p class="m-0 px-3 py-6 text-center text-sm text-faint" role="status">
              {props.emptyText}
            </p>
          }
        >
          {(item) => (
            <button
              id={state.optionId(item.id)}
              class="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45"
              classList={{ "bg-surface-raised ring-1 ring-accent-border": state.highlightedId() === item.id }}
              type="button"
              role="option"
              tabindex={-1}
              aria-disabled={item.disabled === true}
              aria-selected={props.selectedId === item.id}
              disabled={item.disabled === true}
              onClick={() => state.itemSelect(item)}
              onMouseMove={() => state.itemHighlight(item)}
            >
              {props.renderLeading?.(item)}
              <span class="block min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-2 font-medium text-strong">
                  <span class="truncate" title={item.label}>
                    {item.label}
                  </span>
                  <Show when={item.disabledReason}>
                    {(reason) => <span class="ml-auto shrink-0 text-xs font-normal text-faint">{reason()}</span>}
                  </Show>
                </span>
                <Show when={item.description}>
                  {(description) => (
                    <span class="block truncate text-xs text-faint" title={description()}>
                      {description()}
                    </span>
                  )}
                </Show>
              </span>
            </button>
          )}
        </For>
      </div>

      <div
        class="hidden items-center justify-between border-line-subtle border-t pt-2 text-xs text-faint sm:flex"
        aria-hidden="true"
      >
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> Navigate
        </span>
        <span>
          <kbd>Home</kbd>
          <kbd>End</kbd> Jump
        </span>
        <span>
          <kbd>↵</kbd> Select
        </span>
      </div>
    </div>
  )
}
