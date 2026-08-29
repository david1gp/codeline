import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { noteContentFieldStateCreate } from "../../note/ui/noteContentFieldStateCreate.js"
import { noteLineCount } from "../../note/ui/noteLineCount.js"
import { noteProjectChoicesResolve } from "../../note/ui/noteProjectChoicesResolve.js"
import type { NoteScreenView } from "../../note/ui/noteScreenView.js"
import { noteTitleStateCreate } from "../../note/ui/noteTitleStateCreate.js"
import { demoNoteProjectsFixture } from "./demoNoteProjectsFixture.js"
import { demoNotesFixture } from "./demoNotesFixture.js"
import { demoNoteViewModeStateCreate } from "./demoNoteViewModeStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const demoNote = demoNotesFixture[0]

export function demoNoteScreenStateCreate(variant: () => DemoSessionScreenVariant): NoteScreenView {
  const content = createSignalObject<string>(demoNote.content)
  const projectId = createSignalObject<string | null>(demoNote.projectId)
  const isDeleteConfirmOpen = createSignalObject(false)
  const viewModeState = demoNoteViewModeStateCreate(variant)
  const contentField = noteContentFieldStateCreate({ content: content.get, viewMode: viewModeState.viewMode })
  const titleState = noteTitleStateCreate({ content: content.get, debounceMs: 0 })
  const hasNote = () => variant() !== "empty" && variant() !== "loading"

  return {
    ...viewModeState,
    contentField,
    content: content.get,
    contentUpdate: (event) => content.set(event.currentTarget.value),
    dataStatus: () => (variant() === "loading" ? ("reconciling" as const) : ("ready" as const)),
    deleteConfirm: () => isDeleteConfirmOpen.set(false),
    deleteConfirmClose: () => isDeleteConfirmOpen.set(false),
    deleteConfirmOpen: () => isDeleteConfirmOpen.set(true),
    hasError: () => variant() === "error",
    hasNote,
    isDeleteConfirmOpen: isDeleteConfirmOpen.get,
    isDirty: () => content.get() !== demoNote.content || projectId.get() !== demoNote.projectId,
    isLoading: () => variant() === "loading",
    isNotFound: () => variant() === "empty",
    isSaving: () => variant() === "streaming",
    lineCount: () => noteLineCount(content.get()),
    projectId: () => projectId.get() ?? "",
    projectIdUpdate: (event) => projectId.set(event.currentTarget.value === "" ? null : event.currentTarget.value),
    projects: () => noteProjectChoicesResolve(demoNoteProjectsFixture, projectId.get(), demoNote.projectPath),
    refresh: () => {},
    revalidate: () => {},
    submit: (event) => event.preventDefault(),
    title: titleState.title,
  }
}
