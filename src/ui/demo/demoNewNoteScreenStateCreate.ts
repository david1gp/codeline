import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { NewNoteScreenView } from "../../note/ui/newNoteScreenView.js"
import { noteContentFieldStateCreate } from "../../note/ui/noteContentFieldStateCreate.js"
import { noteTitleStateCreate } from "../../note/ui/noteTitleStateCreate.js"
import { demoNoteProjectsFixture } from "./demoNoteProjectsFixture.js"
import { demoNoteViewModeStateCreate } from "./demoNoteViewModeStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const demoDraft = "Catalog ideas\n\nRender every reusable component from fixtures, never from a live backend."

export function demoNewNoteScreenStateCreate(variant: () => DemoSessionScreenVariant): NewNoteScreenView {
  const content = createSignalObject(variant() === "empty" ? "" : demoDraft)
  const viewModeState = demoNoteViewModeStateCreate(variant)
  const contentField = noteContentFieldStateCreate({ content: content.get, viewMode: viewModeState.viewMode })
  const titleState = noteTitleStateCreate({ content: content.get, debounceMs: 0 })

  return {
    ...viewModeState,
    contentField,
    content: content.get,
    contentUpdate: (event) => content.set(event.currentTarget.value),
    hasError: () => variant() === "error",
    isSaving: () => variant() === "loading",
    projectId: () => "",
    projectIdUpdate: () => {},
    projects: () => demoNoteProjectsFixture,
    submit: (event) => event.preventDefault(),
    title: titleState.title,
  }
}
