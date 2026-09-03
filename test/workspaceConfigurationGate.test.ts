import { expect, test } from "bun:test"
import { workspaceSessionPaneVisibleResolve } from "../src/ui/workspaceSessionPaneVisibleResolve.js"

test("a read-only cached session renders without a ready execution target", () => {
  expect(workspaceSessionPaneVisibleResolve({ configurationStatus: "ready", readOnlyReason: null })).toBe(true)
  expect(workspaceSessionPaneVisibleResolve({ configurationStatus: "server-error", readOnlyReason: null })).toBe(false)
  expect(
    workspaceSessionPaneVisibleResolve({ configurationStatus: "server-error", readOnlyReason: "signed-out" }),
  ).toBe(true)
  expect(workspaceSessionPaneVisibleResolve({ configurationStatus: "loading", readOnlyReason: "offline" })).toBe(true)
})

test("the workspace shows the initial composer when execution configuration is ready", async () => {
  const workspacePage = await Bun.file(new URL("../src/ui/WorkspacePage.tsx", import.meta.url)).text()
  const normalized = workspacePage.replace(/\s+/g, " ")

  expect(normalized).toContain(
    "when={workspaceSessionPaneVisibleResolve({ configurationStatus: props.state.sessionTargetSelector.configurationReadiness().status, hasSelectedSession: props.state.selectedSession.session() !== undefined, readOnlyReason: props.state.selectedSession.readOnlyReason(), })}",
  )
  // Both panes receive the resource selector, so the pending selection is configurable
  // before a session exists and the captured one is shown after it does.
  expect(normalized).toContain(
    "fallback={ <WorkspaceSetupPanel configuration={props.state.sessionTargetSelector.configurationReadiness()} resources={props.state.sessionResourceSelector} /> }",
  )
  expect(normalized).toContain(
    "<SelectedSession activeProject={props.state.activeProject} providerModel={props.state.providerModelSelector} resources={props.state.sessionResourceSelector} sessionTarget={props.state.sessionTargetSelector} shell={props.state.shell} state={props.state.selectedSession} />",
  )
})

test("the initial composer keeps execution and provider targets visible", async () => {
  const selectedSession = await Bun.file(new URL("../src/ui/SelectedSession.tsx", import.meta.url)).text()
  const normalized = selectedSession.replace(/\s+/g, " ")

  expect(normalized).toContain(
    "<SessionChat providerModel={props.providerModel} sessionTarget={props.sessionTarget} state={props.state.initialChat} />",
  )
})

test("the no-selection view keeps the composer instead of a preparing placeholder", async () => {
  const selectedSession = await Bun.file(new URL("../src/ui/SelectedSession.tsx", import.meta.url)).text()

  expect(selectedSession).toContain("Select a conversation or start a new one.")
  expect(selectedSession).not.toContain("No conversation")
  expect(selectedSession).not.toContain("Choose a session from the sidebar, or start a new one.")
  expect(selectedSession).not.toContain("Preparing your conversation")
  expect(selectedSession).not.toContain("Preparing conversation before messages can be sent.")
  expect(selectedSession).not.toContain("Start a new conversation")
  expect(selectedSession).not.toContain("Select an active conversation")
  expect(selectedSession).not.toContain("Select a session")
})

test("the setup panel reports organization machine availability and exposes one execution agent", async () => {
  const setupPanel = await Bun.file(new URL("../src/ui/WorkspaceSetupPanel.tsx", import.meta.url)).text()

  expect(setupPanel).toContain('props.configuration.status === "loading"')
  expect(setupPanel).toContain('props.configuration.status === "no-server"')
  expect(setupPanel).toContain('props.configuration.status === "server-error"')
  expect(setupPanel).toContain('props.configuration.status === "no-agent"')
  expect(setupPanel).toContain('props.configuration.status === "agent-error"')
  expect(setupPanel).toContain("No machine is available for this organization")
  expect(setupPanel).toContain(
    "No machine is configured or available for the organization linked to your signed-in account.",
  )
  expect(setupPanel).toContain("Check servers again")
  expect(setupPanel).not.toContain("invite")
  expect(setupPanel).not.toContain("your server")
  expect(setupPanel).toContain("Ready for local execution")
  expect(setupPanel).toContain("No local agent configured")
  expect(setupPanel).toContain("props.configuration.sessionCreateStart()")
  expect(setupPanel).toContain('from "#ui/interactive/button/Button.jsx"')
})
