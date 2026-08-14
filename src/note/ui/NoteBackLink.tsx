import { A } from "@solidjs/router"

export function NoteBackLink() {
  return (
    <A class="mb-7 inline-flex items-center gap-1.5 text-sm text-faint no-underline hover:text-accent" href="/notes">
      <svg aria-hidden="true" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      Back to notes
    </A>
  )
}
