import { expect, test } from "bun:test"
import * as v from "valibot"
import { sessionExecutionSelectionAgentDefaultsResolve } from "../src/session/actions/sessionExecutionSelectionAgentDefaultsResolve.js"
import { sessionExecutionSelectionResolve } from "../src/session/actions/sessionExecutionSelectionResolve.js"
import { sessionExecutionSelectionDefaultSchema } from "../src/session/schema/sessionExecutionSelectionDefaultSchema.js"

const primaryAgentId = "primary-agent"
const savedSelection = {
  tools: {
    primary: { agentId: primaryAgentId, tools: { bash: true, webfetch: false } },
    selectableSubagents: [{ agentId: "reviewer", tools: { bash: false, webfetch: true } }],
  },
  version: 1 as const,
}
const explicitSelection = {
  tools: {
    primary: { agentId: primaryAgentId, tools: { bash: false, webfetch: true } },
    selectableSubagents: [],
  },
  version: 1 as const,
}

test("execution selection defaults are strict and limited to bash/webfetch", () => {
  expect(
    v.safeParse(sessionExecutionSelectionDefaultSchema, {
      executionSelection: savedSelection,
      projectPath: "~/project",
      unexpected: true,
    }).success,
  ).toBe(false)
  expect(
    v.safeParse(sessionExecutionSelectionDefaultSchema, {
      executionSelection: {
        ...savedSelection,
        tools: {
          ...savedSelection.tools,
          primary: {
            ...savedSelection.tools.primary,
            tools: { ...savedSelection.tools.primary.tools, shell: true },
          },
        },
      },
      projectPath: "~/project",
    }).success,
  ).toBe(false)
})

test("execution selection resolution uses explicit, saved, agent, then false precedence", () => {
  const agentDefaults = {
    tools: {
      primary: { agentId: primaryAgentId, tools: { bash: true, webfetch: true } },
      selectableSubagents: [],
    },
    version: 1 as const,
  }

  expect(
    sessionExecutionSelectionResolve({
      agentDefaults,
      explicit: explicitSelection,
      primaryAgentId,
      saved: savedSelection,
    }),
  ).toEqual({ success: true, data: explicitSelection })
  expect(sessionExecutionSelectionResolve({ agentDefaults, primaryAgentId, saved: savedSelection })).toEqual({
    success: true,
    data: savedSelection,
  })
  expect(sessionExecutionSelectionResolve({ agentDefaults, primaryAgentId })).toEqual({
    success: true,
    data: agentDefaults,
  })
  expect(sessionExecutionSelectionResolve({ primaryAgentId })).toEqual({
    success: true,
    data: {
      tools: {
        primary: { agentId: primaryAgentId, tools: { bash: false, webfetch: false } },
        selectableSubagents: [],
      },
      version: 1,
    },
  })
})

test("agent configuration defaults resolve independently for every selectable agent", () => {
  expect(
    sessionExecutionSelectionAgentDefaultsResolve(primaryAgentId, [
      { agentId: primaryAgentId, mode: "primary", tools: { bash: true } },
      { agentId: "reviewer", mode: "subagent", tools: { webfetch: true } },
      { agentId: "disabled", enabled: false, mode: "subagent", tools: { bash: true, webfetch: true } },
    ]),
  ).toEqual({
    success: true,
    data: {
      tools: {
        primary: { agentId: primaryAgentId, tools: { bash: true, webfetch: false } },
        selectableSubagents: [{ agentId: "reviewer", tools: { bash: false, webfetch: true } }],
      },
      version: 1,
    },
  })
})
