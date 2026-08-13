import { createEffect, createSignal, onCleanup } from "solid-js/dist/solid.js"
import { noteContentTitleDerive } from "./noteContentTitleDerive.js"

const debounceDefaultMs = 200

type NoteTitleStateOptions = {
  content: () => string
  debounceMs?: number
}

export function noteTitleStateCreate(options: NoteTitleStateOptions) {
  const delay = options.debounceMs ?? debounceDefaultMs
  const [title, titleSet] = createSignal(noteContentTitleDerive(options.content()))

  createEffect(() => {
    const next = noteContentTitleDerive(options.content())
    const timer = setTimeout(() => titleSet(next), delay)
    onCleanup(() => clearTimeout(timer))
  })

  return { title }
}
