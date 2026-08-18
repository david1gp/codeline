import { For, Match, Switch } from "solid-js"
import { FinalizedMessage } from "../../message/ui/FinalizedMessage.js"
import { NewNotePage } from "../../note/ui/NewNotePage.js"
import { NoteBackLink } from "../../note/ui/NoteBackLink.js"
import { NoteContentField } from "../../note/ui/NoteContentField.js"
import { NotePage } from "../../note/ui/NotePage.js"
import { NotesPage } from "../../note/ui/NotesPage.js"
import { NoteViewModeSwitcher } from "../../note/ui/NoteViewModeSwitcher.js"
import { NoteWorkspacePage } from "../../note/ui/NoteWorkspacePage.js"
import { ProjectBrowser } from "../../project/ProjectBrowser.js"
import { ProjectGitPanel } from "../../project/ProjectGitPanel.js"
import { ProviderModelSelector } from "../../providers/ui/ProviderModelSelector.js"
import { SessionRenameControl } from "../../session/ui/SessionRenameControl.js"
import { App } from "../App.js"
import { FilesPage } from "../FilesPage.js"
import { ConnectionStatusIndicator } from "../ConnectionStatusIndicator.js"
import { ThemeSwitcher } from "../ThemeSwitcher.js"
import { SelectedSession } from "../SelectedSession.js"
import { SessionChat } from "../SessionChat.js"
import { SessionList } from "../SessionList.js"
import { SessionTargetSelector } from "../SessionTargetSelector.js"
import { WorkspacePage } from "../WorkspacePage.js"
import type { demoSpecimenStateCreate } from "./demoSpecimenStateCreate.js"
import type { DemoSpecimen } from "./demoSpecimen.js"

export function DemoSpecimenPanel(props: {
  specimen: DemoSpecimen
  state: ReturnType<typeof demoSpecimenStateCreate>
}) {
  return (
    <Switch>
      <Match when={props.specimen.slug === "workspace-screen"}>
        <WorkspacePage state={props.state.workspace} />
      </Match>
      <Match when={props.specimen.slug === "files-screen"}>
        <FilesPage state={props.state.files} />
      </Match>
      <Match when={props.specimen.slug === "project-browser"}>
        <div class="p-6">
          <ProjectBrowser state={props.state.projectBrowser} />
        </div>
      </Match>
      <Match when={props.specimen.slug === "project-git-panel"}>
        <div class="p-6">
          <ProjectGitPanel state={props.state.projectBrowser.git} />
        </div>
      </Match>
      <Match when={props.specimen.slug === "notes-screen"}>
        <NotesPage state={props.state.notes} />
      </Match>
      <Match when={props.specimen.slug === "new-note-screen"}>
        <NewNotePage state={props.state.newNote} />
      </Match>
      <Match when={props.specimen.slug === "note-workspace-screen"}>
        <NoteWorkspacePage state={props.state.noteWorkspace} />
      </Match>
      <Match when={props.specimen.slug === "note-screen"}>
        <NotePage state={props.state.note} />
      </Match>
      <Match when={props.specimen.slug === "app-shell"}>
        <App state={props.state.appShell}>
          <div class="grid place-items-center p-10 text-sm text-faint">Route content renders here.</div>
        </App>
      </Match>
      <Match when={props.specimen.slug === "note-back-link"}>
        <div class="p-6">
          <NoteBackLink />
        </div>
      </Match>
      <Match when={props.specimen.slug === "session-rename-control"}>
        <div class="p-6">
          <SessionRenameControl state={props.state.selectedSession.renameState()!} />
        </div>
      </Match>
      <Match when={props.specimen.slug === "finalized-message"}>
        <div class="grid gap-6 p-6">
          <For each={props.state.finalizedMessages()}>
            {(message) => <FinalizedMessage content={message.content} role={message.role} state={message.copyState} />}
          </For>
        </div>
      </Match>
      <Match when={props.specimen.slug === "theme-switcher"}>
        <div class="p-6">
          <ThemeSwitcher state={props.state.appShell.theme} />
        </div>
      </Match>
      <Match when={props.specimen.slug === "connection-status-indicator"}>
        <div class="p-6">
          <ConnectionStatusIndicator state={props.state.appShell.connection} />
        </div>
      </Match>
      <Match when={props.specimen.slug === "note-content-field"}>
        <div class="p-6">
          <NoteContentField
            content={props.state.newNote.content}
            contentUpdate={props.state.newNote.contentUpdate}
            state={props.state.newNote.contentField}
            viewMode={props.state.newNote.viewMode}
          />
        </div>
      </Match>
      <Match when={props.specimen.slug === "note-view-mode-switcher"}>
        <div class="p-6">
          <NoteViewModeSwitcher
            viewMode={props.state.newNote.viewMode}
            viewModeSelect={props.state.newNote.viewModeSelect}
          />
        </div>
      </Match>
      <Match when={props.specimen.slug === "session-list"}>
        <div class="w-[min(320px,100%)] p-6">
          <SessionList activeProject={props.state.workspace.activeProject} state={props.state.sessionList} />
        </div>
      </Match>
      <Match when={props.specimen.slug === "selected-session"}>
        <div class="flex min-h-0 flex-col py-6">
          <SelectedSession state={props.state.selectedSession} />
        </div>
      </Match>
      <Match when={props.specimen.slug === "session-chat"}>
        <div class="py-6">
          <SessionChat state={props.state.sessionChat} />
        </div>
      </Match>
      <Match when={props.specimen.slug === "session-target-selector"}>
        <div class="flex flex-wrap items-center gap-[18px] p-6">
          <SessionTargetSelector state={props.state.sessionTargetSelector} />
        </div>
      </Match>
      <Match when={props.specimen.slug === "provider-model-selector"}>
        <div class="p-6">
          <ProviderModelSelector state={props.state.providerModelSelector} />
        </div>
      </Match>
    </Switch>
  )
}
