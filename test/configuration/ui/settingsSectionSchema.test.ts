import { expect, test } from "bun:test"
import * as v from "valibot"
import { settingsSectionSchema } from "../../../src/configuration/ui/settingsSectionSchema.js"
import { urlSettings } from "../../../src/ui/settings_url/urlSettings.js"
import { toolNameSchema } from "../../../src/tools/schema/toolNameSchema.js"

test("settings links expose separate global resource, set and preset sections while retaining General", () => {
  expect(urlSettings("general")).toBe("/settings")
  for (const section of [
    "skills",
    "skill-sets",
    "commands",
    "command-sets",
    "tools",
    "tool-sets",
    "subagent-sets",
    "agent-presets",
  ] as const) {
    expect(v.safeParse(settingsSectionSchema, section).success).toBe(true)
    expect(urlSettings(section)).toBe(`/settings?section=${section}`)
  }
  expect(toolNameSchema.options).toContain("bash")
  expect(toolNameSchema.options).toContain("delegate_task")
})
