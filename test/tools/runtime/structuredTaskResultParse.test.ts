import { describe, expect, test } from "bun:test"
import * as v from "valibot"
import {
  structuredTaskResultParse,
  subagentFindingsSchema,
} from "../../../src/tools/runtime/structuredTaskResultParse.js"

describe("structuredTaskResultParse", () => {
  test("validates findings-shaped subagent JSON", () => {
    const text = JSON.stringify({ findings: [{ detail: "x", severity: "high", title: "SQL injection" }] })
    const parsed = structuredTaskResultParse(text, subagentFindingsSchema)
    expect(parsed.success).toBe(true)
  })

  test("accepts fenced JSON blocks", () => {
    const text = '```json\n{"findings": []}\n```'
    const parsed = structuredTaskResultParse(text, subagentFindingsSchema)
    expect(parsed.success).toBe(true)
  })

  test("rejects non-JSON prose", () => {
    const parsed = structuredTaskResultParse("just some prose", v.strictObject({ a: v.string() }))
    expect(parsed.success).toBe(false)
  })

  test("rejects schema mismatches", () => {
    const parsed = structuredTaskResultParse('{"findings": "nope"}', subagentFindingsSchema)
    expect(parsed.success).toBe(false)
  })
})
