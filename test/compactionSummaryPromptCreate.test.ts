import { expect, test } from "bun:test"
import { compactionSummaryPromptCreate } from "../src/compaction/compactionSummaryPromptCreate.js"

test("creates a structured rolling-summary prompt with exact-context requirements", () => {
  const result = compactionSummaryPromptCreate({
    criticalContext: "The preview service is managed by systemd.",
    previousSummary: "The user wants a safe change.",
    transcript: "Read src/example.ts and ran `bun test`.",
  })

  expect(result).toMatchObject({ success: true })
  if (result.success) {
    for (const section of [
      "Goals",
      "Constraints",
      "Decisions",
      "Progress",
      "Errors",
      "Exact paths and commands",
      "File reads",
      "Files modified",
      "Next step",
      "Critical context",
    ]) {
      expect(result.data).toContain(`## ${section}`)
    }
    expect(result.data).toContain("src/example.ts")
    expect(result.data).toContain("The preview service is managed by systemd.")
  }
})

test("rejects an empty transcript", () => {
  expect(compactionSummaryPromptCreate({ transcript: "  " })).toMatchObject({
    errorMessage: "A transcript is required to create a summary prompt.",
    success: false,
  })
})
