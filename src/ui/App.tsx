import { Badge } from "@adaptive-ds/solid-ui/static/badge/Badge"
import { appStateCreate } from "./appStateCreate.js"
import { SelectedSession } from "./SelectedSession.js"
import { SessionList } from "./SessionList.js"
import { sessionNavigationStateCreate } from "./sessionNavigationStateCreate.js"
import { ZeroConnectionIndicator } from "./ZeroConnectionIndicator.js"

export function App() {
  const state = appStateCreate()
  const sessionNavigation = sessionNavigationStateCreate()

  return (
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#workspace" aria-label="Codeline workspace">
          <span class="brand-mark" aria-hidden="true">
            C/
          </span>
          <span>Codeline</span>
        </a>

        <nav class="primary-nav" aria-label="Primary navigation">
          <a class="nav-link nav-link-active" href="#workspace" aria-current="page">
            Workspace
          </a>
          <a class="nav-link" href="#activity">
            Activity
          </a>
        </nav>

        <div class="connection-statuses">
          <ZeroConnectionIndicator />
          <Badge variant={state.healthVariant()} class="health-badge" role="status" aria-live="polite">
            <span class="health-dot" aria-hidden="true" />
            {state.healthLabel()}
          </Badge>
        </div>
      </header>

      <main class="workspace" id="workspace">
        <aside class="sidebar" aria-label="Workspace navigation">
          <div>
            <p class="eyebrow">Workspace</p>
            <h1>Local session</h1>
            <p class="sidebar-copy">No project or conversation is open.</p>
          </div>

          <SessionList navigation={sessionNavigation} />

          <div class="sidebar-footer">
            <span class="shortcut">Zero-synced foundation</span>
            <span class="version">v0.1</span>
          </div>
        </aside>

        <section class="chat-panel" aria-label="Conversation workspace">
          <div class="toolbar" aria-label="Session controls">
            <label class="selector-field">
              <span>Server</span>
              <select disabled aria-describedby="server-upcoming">
                <option>Local server</option>
              </select>
              <small id="server-upcoming">Upcoming</small>
            </label>

            <span class="toolbar-divider" aria-hidden="true" />

            <label class="selector-field">
              <span>Agent</span>
              <select disabled aria-describedby="agent-upcoming">
                <option>No agent configured</option>
              </select>
              <small id="agent-upcoming">Upcoming</small>
            </label>
          </div>

          <SelectedSession navigation={sessionNavigation} />

          <div class="composer-placeholder" aria-label="Chat composer unavailable">
            <div>
              <span class="composer-prompt">›</span>
              <span>Chat input will arrive with agent execution.</span>
            </div>
            <button type="button" disabled>
              Send
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
