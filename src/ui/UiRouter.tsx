import { Route, Router } from "@solidjs/router"
import { NewNotePage } from "../note/ui/NewNotePage.js"
import { NotesPage } from "../note/ui/NotesPage.js"
import { ApplicationRoot } from "./ApplicationRoot.js"
import { FilesPage } from "./FilesPage.js"
import { NoteRoutePage } from "./NoteRoutePage.js"
import { WorkspacePage } from "./WorkspacePage.js"
import { DemoApp } from "./demo/DemoApp.js"
import { SimulateApp } from "./simulate/SimulateApp.js"

export function UiRouter() {
  return (
    <Router>
      <Route path="/" component={ApplicationRoot}>
        <Route path="/" component={WorkspacePage} />
        <Route path="/files" component={FilesPage} />
        <Route path="/notes" component={NotesPage} />
        <Route path="/notes/new" component={NewNotePage} />
        <Route path="/notes/:noteId" component={NoteRoutePage} />
      </Route>
      <Route path="/demo" component={DemoApp} />
      <Route path="/demo/conversation" component={DemoApp} />
      <Route path="/demo/streaming" component={DemoApp} />
      <Route path="/demo/long-chat" component={DemoApp} />
      <Route path="/demo/workspace" component={DemoApp} />
      <Route path="/demo/files" component={DemoApp} />
      <Route path="/demo/markdown" component={DemoApp} />
      <Route path="/demo/mermaid" component={DemoApp} />
      <Route path="/demo/diff" component={DemoApp} />
      <Route path="/demo/models" component={DemoApp} />
      <Route path="/demo/skills" component={DemoApp} />
      <Route path="/demo/stats" component={DemoApp} />
      <Route path="/demo/system-prompt" component={DemoApp} />
      <Route path="/demo/extensions" component={DemoApp} />
      <Route path="/demo/written-files" component={DemoApp} />
      <Route path="/demo/*unknownDemo" component={DemoApp} />
      <Route path="/simulate" component={SimulateApp} />
      <Route path="/simulate/streaming" component={SimulateApp} />
      <Route path="/simulate/thinking-tools" component={SimulateApp} />
      <Route path="/simulate/retry-success" component={SimulateApp} />
      <Route path="/simulate/retry-exhausted" component={SimulateApp} />
      <Route path="/simulate/terminal-error" component={SimulateApp} />
      <Route path="/simulate/unexpected-end" component={SimulateApp} />
      <Route path="/simulate/cancellation" component={SimulateApp} />
      <Route path="/simulate/*unknownSimulation" component={SimulateApp} />
    </Router>
  )
}
