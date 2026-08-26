import { expect, test } from "bun:test"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { sessionExecutionSelectionCanonicalize } from "../src/session/actions/sessionExecutionSelectionCanonicalize.js"
import { sessionExecutionSelectionErrorCodes } from "../src/session/errors/sessionExecutionSelectionErrorCodes.js"

const catalogResult = await providerAgentCatalogLoad(process.cwd())
if (!catalogResult.success) throw new Error(catalogResult.errorMessage)

test("validates selected agents against the provider catalog", () => {
  const valid = sessionExecutionSelectionCanonicalize(
    {
      tools: {
        primary: { agentId: "luna-high", tools: { bash: true, webfetch: false } },
        selectableSubagents: [{ agentId: "explore", tools: { bash: false, webfetch: true } }],
      },
      version: 1,
    },
    "luna-high",
    { catalog: catalogResult.data },
  )
  expect(valid.success).toBe(true)

  const unknown = sessionExecutionSelectionCanonicalize(
    {
      tools: {
        primary: { agentId: "luna-high", tools: { bash: false, webfetch: false } },
        selectableSubagents: [{ agentId: "missing-agent", tools: { bash: false, webfetch: false } }],
      },
      version: 1,
    },
    "luna-high",
    { catalog: catalogResult.data },
  )
  expect(unknown).toMatchObject({
    code: sessionExecutionSelectionErrorCodes.subagentUnavailable,
    errorMessage: "The session execution selection references an unavailable subagent in the provider catalog.",
    success: false,
  })
})

test("does not allow primary-only catalog agents as selectable subagents", () => {
  const result = sessionExecutionSelectionCanonicalize(
    {
      tools: {
        primary: { agentId: "luna-high", tools: { bash: false, webfetch: false } },
        selectableSubagents: [{ agentId: "build", tools: { bash: false, webfetch: false } }],
      },
      version: 1,
    },
    "luna-high",
    { catalog: catalogResult.data },
  )
  expect(result).toMatchObject({
    code: sessionExecutionSelectionErrorCodes.primaryOnlySubagent,
    errorMessage: "The session execution selection references a primary-only agent as a subagent.",
    success: false,
  })
})
