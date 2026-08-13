import { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import type { NoteViewMode } from "./noteViewModeSchema.js"

type NoteContentFieldProps = {
  autofocus?: boolean
  content: () => string
  contentUpdate: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => void
  placeholder?: string
  viewMode: () => NoteViewMode
}

export function NoteContentField(props: NoteContentFieldProps) {
  const state = noteContentFieldStateCreate({ content: () => props.content(), viewMode: () => props.viewMode() })

  return (
    <div classList={{ "grid gap-4": true, "lg:grid-cols-2": state.isSplit() }}>
      <div hidden={!state.isEditorVisible()}>
        <label class="sr-only" for="note-content">
          Note content
        </label>
        <textarea
          class="min-h-[24rem] w-full resize-y rounded-xl border border-[#30342a] bg-[#171a15] p-5 font-[inherit] text-[15px] leading-7 text-[#ebece5] outline-none placeholder:text-[#686d61] focus:border-[#768d3d]"
          id="note-content"
          value={props.content()}
          onInput={props.contentUpdate}
          placeholder={props.placeholder}
          autofocus={props.autofocus}
          required
        />
      </div>

      <div
        id="note-content-preview"
        hidden={!state.isPreviewVisible()}
        aria-label="Note preview"
        tabindex={0}
        class="min-h-[24rem] w-full overflow-auto rounded-xl border border-[#30342a] bg-[#171a15] p-5 text-[15px] leading-7 text-[#ebece5] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-[#d8ff72] [&_a]:underline [&_code]:rounded [&_code]:bg-[#25281f] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#30342a] [&_pre]:bg-[#171914] [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0"
        innerHTML={state.isPreviewEmpty() ? "<p>Nothing to preview yet.</p>" : state.previewHtml()}
      />
    </div>
  )
}
