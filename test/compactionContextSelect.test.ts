import { expect, test } from "bun:test"
import { compactionContextSelect } from "../src/compaction/compactionContextSelect.js"

test("projects the summary before the safe retained tail", () => {
  const result = compactionContextSelect({
    messages: [
      { content: "old", id: "old", role: "user" },
      { content: "recent", id: "recent", role: "user" },
    ],
    recentTokenBudget: 1,
    summary: "## Goals\nContinue the work.",
  })

  expect(result).toMatchObject({ success: true, data: { cutIndex: 1 } })
  if (result.success) expect(result.data.context.map(({ id }) => id)).toEqual(["compaction-summary", "recent"])
})
