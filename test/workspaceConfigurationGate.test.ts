import { expect, test } from "bun:test"

test("the workspace shows setup until a conversation is selected", async () => {
  const workspacePage = await Bun.file(new URL("../src/ui/WorkspacePage.tsx", import.meta.url)).text()
  const normalized = workspacePage.replace(/\s+/g, " ")

  expect(normalized.match(/when=\{props\.state\.selectedSession\.hasSelection\(\)\}/g)).toHaveLength(1)
  expect(normalized).toContain(
    "fallback={<WorkspaceSetupPanel configuration={props.state.sessionTargetSelector.configurationReadiness()} />}",
  )
  expect(normalized).toContain(
    "<SelectedSession providerModel={props.state.providerModelSelector} sessionTarget={props.state.sessionTargetSelector} state={props.state.selectedSession} />",
  )
})

test("the setup panel exposes one local execution agent", async () => {
  const setupPanel = await Bun.file(new URL("../src/ui/WorkspaceSetupPanel.tsx", import.meta.url)).text()

  expect(setupPanel).toContain('props.configuration.status === "loading"')
  expect(setupPanel).toContain('props.configuration.status === "no-server"')
  expect(setupPanel).toContain('props.configuration.status === "server-error"')
  expect(setupPanel).toContain('props.configuration.status === "no-agent"')
  expect(setupPanel).toContain('props.configuration.status === "agent-error"')
  expect(setupPanel).toContain("Ready for local execution")
  expect(setupPanel).toContain("No local agent configured")
  expect(setupPanel).toContain("props.configuration.sessionCreateStart()")
  expect(setupPanel).toContain('from "#ui/interactive/button/Button.jsx"')
})
