import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useNavigate } from "@solidjs/router"
import * as v from "valibot"
import type { ProjectRegistryState } from "../../project/ui/projectRegistryState.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { noteCreateRequest } from "../client/noteCreateRequest.js"
import type { NewNoteScreenView } from "./newNoteScreenView.js"
import { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import { noteTitleStateCreate } from "./noteTitleStateCreate.js"
import { noteViewModeStateCreate } from "./noteViewModeStateCreate.js"

const draftKey = "codeline.note.new.content"
type NewNotePageStateOptions = {
  accountId?: () => string | null
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  projectRegistry?: ProjectRegistryState
}

export function newNotePageStateCreate(options: NewNotePageStateOptions = {}): NewNoteScreenView {
  const navigate = useNavigate()
  const fetcher = options.fetcher ?? fetch
  const storedDraft = v.safeParse(v.string(), localStorage.getItem(draftKey))
  const content = createSignalObject(storedDraft.success ? storedDraft.output : "")
  const projectId = createSignalObject<string | null>(null)
  const projectList = noteProjectListStateCreate({
    apiBase: options.apiBase,
    fetcher,
    ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
    ...(options.projectRegistry === undefined ? {} : { projectRegistry: options.projectRegistry }),
  })
  const status = createSignalObject<"idle" | "saving" | "error">("idle")
  const viewModeState = noteViewModeStateCreate()
  const contentField = noteContentFieldStateCreate({ content: content.get, viewMode: viewModeState.viewMode })
  const titleState = noteTitleStateCreate({ content: content.get })

  return {
    ...viewModeState,
    contentField,
    title: titleState.title,
    content: content.get,
    isSaving: () => status.get() === "saving",
    hasError: () => status.get() === "error",
    contentUpdate: (event) => {
      content.set(event.currentTarget.value)
      localStorage.setItem(draftKey, event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    projectId: () => projectId.get() ?? "",
    projectIdUpdate: (event) => {
      projectId.set(event.currentTarget.value === "" ? null : event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    projects: projectList.availableProjects,
    submit: async (event) => {
      event.preventDefault()
      if (content.get().trim() === "" || status.get() === "saving") return
      status.set("saving")
      const now = Date.now()
      const result = await noteCreateRequest(
        {
          content: content.get(),
          createdAt: now,
          id: uuidv7(),
          projectId: projectId.get(),
          updatedAt: now,
        },
        { fetch: fetcher },
      )
      if (!result.success) {
        status.set("error")
        return
      }
      localStorage.removeItem(draftKey)
      navigate("/notes")
    },
  }
}
