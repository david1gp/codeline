import { describe, expect, it } from "bun:test"
import { commandIntentConsume } from "./commandIntentConsume.js"

describe("commandIntentConsume", () => {
  it("dispatches a queued project-targeted session intent once workspace actions register", () => {
    const calls: string[] = []
    const actions = {
      projectCreateOpen: () => calls.push("project"),
      sessionNew: (projectId?: string) => calls.push(`session:${projectId ?? "default"}`),
    }
    const pending = commandIntentConsume({ kind: "new-session-project", projectId: "project-7" }, actions)

    expect(calls).toEqual(["session:project-7"])
    expect(commandIntentConsume(pending, actions)).toBeNull()
    expect(calls).toEqual(["session:project-7"])
  })

  it("dispatches new-session and new-project intents", () => {
    const calls: string[] = []
    const actions = {
      projectCreateOpen: () => calls.push("project"),
      sessionNew: () => calls.push("session"),
    }

    commandIntentConsume({ kind: "new-session" }, actions)
    commandIntentConsume({ kind: "new-project" }, actions)

    expect(calls).toEqual(["session", "project"])
  })
})
