import { expect, test } from "bun:test"
import { compactionPolicyDefaults } from "../src/compaction/compactionPolicyDefaults.js"
import { compactionPolicyResolve } from "../src/compaction/compactionPolicyResolve.js"

test("provides conservative defaults and accepts valid overrides", () => {
  const result = compactionPolicyResolve({ contextLimitTokens: 32_000, recentTokenBudget: 4_000 })

  expect(result).toMatchObject({
    success: true,
    data: {
      ...compactionPolicyDefaults,
      contextLimitTokens: 32_000,
      recentTokenBudget: 4_000,
    },
  })
})

test("rejects a policy that cannot leave a compacted prefix", () => {
  const result = compactionPolicyResolve({
    contextLimitTokens: 10_000,
    recentTokenBudget: 2_000,
    reserveOutputTokens: 8_000,
  })

  expect(result).toMatchObject({ success: false, op: "compactionPolicyResolve" })
})
