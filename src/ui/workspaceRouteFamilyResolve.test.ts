import { expect, test } from "bun:test"
import { workspaceRouteFamilyResolve } from "./workspaceRouteFamilyResolve.js"

test("legacy root, new, and detail paths retain the old workspace", () => {
  for (const path of ["/sessions-legacy", "/sessions-legacy/new", "/sessions-legacy/session-id"]) {
    expect(workspaceRouteFamilyResolve(path)).toBe("legacy")
  }
})

test("sessions root, new, and detail paths select the new workspace", () => {
  for (const path of ["/sessions", "/sessions/new", "/sessions/session-id"]) {
    expect(workspaceRouteFamilyResolve(path)).toBe("sessions")
  }
})
