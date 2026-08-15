# Execution agent configuration

## Goal

Make Codeline execution agents selectable and configurable from the workspace setup UI, and provide working Luna agents for the existing Codex-LB and CLIProxyAPI gateways.

## Decisions

- Treat Codeline servers as workspace-owned execution groupings and agent configuration as the LLM provider runtime configuration.
- Store only fixed environment-secret references; never expose or persist literal API secrets in the UI.
- Reuse the existing agent configuration schema, provider model discovery, connection test, session target selection, and deterministic seed workflow.
- Support selecting existing agents and creating/updating an agent configuration from the setup panel.
- Keep provider connectivity validation server-side and authenticated.

## Approach

- Add ownership-checked agent detail, create/update, model discovery, and connection-test API capabilities.
- Expand target-selector state and the workspace setup panel with server/agent selection and a compact provider configuration form.
- Seed deterministic Codex-LB and CLIProxyAPI Luna agents using checked-in non-secret configuration and managed `.env` secret references.
- Verify API behavior, state/UI behavior, real Luna calls, and the browser flow.

## Tasks

- [x] 1. Add authenticated agent configuration persistence and persisted-agent model/connection-test APIs.
- [x] 2. Add workspace setup selection and agent create/edit/test UI using the existing target selector state.
- [x] 3. Add deterministic Codex-LB and CLIProxyAPI Luna fixture agents and managed local environment wiring without checking in secrets.
- [x] 4. Run focused and full verification, make real Luna test calls, and verify the setup flow in a browser.

## Paths

- `src/agents/`
- `src/servers/`
- `src/ui/WorkspaceSetupPanel.tsx`
- `src/ui/WorkspacePage.tsx`
- `src/ui/sessionTargetSelectorStateCreate.ts`
- `src/ui/sessionTargetConfigurationView.ts`
- `src/database/exampleDataFixture.ts`
- `ops/dev/`
- `test/`
