import { For } from "solid-js"
import type { NoteViewMode } from "./noteViewModeSchema.js"

type NoteViewModeSwitcherProps = {
  viewMode: () => NoteViewMode
  viewModeSelect: (value: NoteViewMode) => void
}

const options = [
  { value: "edit", label: "Edit" },
  { value: "preview", label: "Preview" },
  { value: "split", label: "Edit and preview" },
] as const satisfies readonly { value: NoteViewMode; label: string }[]

export function NoteViewModeSwitcher(props: NoteViewModeSwitcherProps) {
  return (
    <fieldset class="m-0 inline-flex gap-0.5 rounded-lg border border-[#30342a] p-0.5">
      <legend class="sr-only">Note view mode</legend>
      <For each={options}>
        {(option) => (
          <button
            class="grid size-8 place-items-center rounded-md text-[#969b8d] hover:text-[#ebece5] aria-pressed:bg-[#25281f] aria-pressed:text-[#d8ff72]"
            type="button"
            aria-pressed={props.viewMode() === option.value}
            aria-label={option.label}
            title={option.label}
            onClick={() => props.viewModeSelect(option.value)}
          >
            <svg
              aria-hidden="true"
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              {option.value === "edit" ? <path d="M4 20h4L19 9l-4-4L4 16v4Z" /> : null}
              {option.value === "preview" ? (
                <>
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </>
              ) : null}
              {option.value === "split" ? (
                <>
                  <rect x="3" y="4.5" width="18" height="15" rx="2" />
                  <path d="M12 4.5v15" />
                </>
              ) : null}
            </svg>
          </button>
        )}
      </For>
    </fieldset>
  )
}
