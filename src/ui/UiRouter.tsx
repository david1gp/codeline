import { Route, Router } from "@solidjs/router"
import { LoginPage } from "../identity/ui/LoginPage.js"
import { ApplicationRoot } from "./ApplicationRoot.js"
import { DemoApp } from "./demo/DemoApp.js"
import { DashboardRoutePage } from "./DashboardRoutePage.js"
import { FilesRoutePage } from "./FilesRoutePage.js"
import { NewNoteRoutePage } from "./NewNoteRoutePage.js"
import { NoteRoutePage } from "./NoteRoutePage.js"
import { NotesRoutePage } from "./NotesRoutePage.js"
import { SettingsRoutePage } from "./SettingsRoutePage.js"
import { SimulateApp } from "./simulate/SimulateApp.js"
import { WorkspaceRoutePage } from "./WorkspaceRoutePage.js"

export function UiRouter() {
  return (
    <Router>
      <Route path="/" component={ApplicationRoot}>
        <Route path="/" component={DashboardRoutePage} />
        <Route path={["/sessions", "/sessions/:sidebarTab"]} component={WorkspaceRoutePage} />
        <Route path="/files" component={FilesRoutePage} />
        <Route path="/notes" component={NotesRoutePage} />
        <Route path="/notes/new" component={NewNoteRoutePage} />
        <Route path="/notes/:noteId" component={NoteRoutePage} />
        <Route path="/settings" component={SettingsRoutePage} />
        <Route path="/simulate" component={SimulateApp} />
        <Route path="/simulate/streaming" component={SimulateApp} />
        <Route path="/simulate/thinking-tools" component={SimulateApp} />
        <Route path="/simulate/retry-success" component={SimulateApp} />
        <Route path="/simulate/retry-exhausted" component={SimulateApp} />
        <Route path="/simulate/terminal-error" component={SimulateApp} />
        <Route path="/simulate/unexpected-end" component={SimulateApp} />
        <Route path="/simulate/cancellation" component={SimulateApp} />
        <Route path="/simulate/*unknownSimulation" component={SimulateApp} />
      </Route>
      <Route path="/login" component={LoginPage} />
      <Route path="/demo" component={DemoApp} />
      <Route path="/demo/*unknownDemo" component={DemoApp} />
    </Router>
  )
}
