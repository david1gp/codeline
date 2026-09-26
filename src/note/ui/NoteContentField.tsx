import type { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import type { NoteViewMode } from "./noteViewModeSchema.js"

type NoteContentFieldProps = {
  autofocus?: boolean
  content: () => string
  contentUpdate: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => void
  placeholder?: string
  state: ReturnType<typeof noteContentFieldStateCreate>
  viewMode: () => NoteViewMode
}

export function NoteContentField(props: NoteContentFieldProps) {
  return (
    <div classList={{ "grid gap-4": true, "lg:grid-cols-2": props.state.isSplit() }}>
      <div hidden={!props.state.isEditorVisible()}>
        <label class="sr-only" for="note-content">
          Note content
        </label>
        <textarea
          class="min-h-[24rem] w-full resize-y rounded-xl border border-line bg-surface p-5 font-[inherit] text-[15px] leading-7 text-strong outline-none placeholder:text-placeholder focus:border-accent-border"
          id="note-content"
          value={props.content()}
          onInput={props.contentUpdate}
          placeholder={props.placeholder}
          autofocus={props.autofocus}
          required
        />
      </div>

      <section
        id="note-content-preview"
        hidden={!props.state.isPreviewVisible()}
        aria-label="Note preview"
        tabindex={0}
        class="min-h-[24rem] w-full overflow-auto rounded-xl border border-line bg-surface p-5 text-[15px] leading-7 text-strong [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-line-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-surface-sunken [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0"
        innerHTML={props.state.isPreviewEmpty() ? "<p>Nothing to preview yet.</p>" : props.state.previewHtml()}
      />
    </div>
  )
}
