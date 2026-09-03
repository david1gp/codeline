import { Route, Router } from "@solidjs/router"
import { getRoutesAuth } from "../identity/auth_url/getRoutesAuth.js"
import { getRoutesNote } from "../note/note_url/getRoutesNote.js"
import { ApplicationRoot } from "./ApplicationRoot.js"
import { getRoutesDashboard } from "./dashboard_url/getRoutesDashboard.js"
import { getRoutesDemo } from "./demo_url/getRoutesDemo.js"
import { getRoutesFiles } from "./files_url/getRoutesFiles.js"
import { getRoutesSettings } from "./settings_url/getRoutesSettings.js"
import { getRoutesSimulate } from "./simulate_url/getRoutesSimulate.js"
import { getRoutesWorkspace } from "./workspace_url/getRoutesWorkspace.js"

export function UiRouter() {
  return (
    <Router>
      <Route path="/" component={ApplicationRoot}>
        {getRoutesDashboard().map((route) => (
          <Route path={route.path} component={route.component} />
        ))}
        {getRoutesWorkspace().map((route) => (
          <Route path={route.path} component={route.component} />
        ))}
        {getRoutesFiles().map((route) => (
          <Route path={route.path} component={route.component} />
        ))}
        {getRoutesNote().map((route) => (
          <Route path={route.path} component={route.component} />
        ))}
        {getRoutesSettings().map((route) => (
          <Route path={route.path} component={route.component} />
        ))}
        {getRoutesSimulate().map((route) => (
          <Route path={route.path} component={route.component} />
        ))}
      </Route>
      {getRoutesAuth().map((route) => (
        <Route path={route.path} component={route.component} />
      ))}
      {getRoutesDemo().map((route) => (
        <Route path={route.path} component={route.component} />
      ))}
    </Router>
  )
}
