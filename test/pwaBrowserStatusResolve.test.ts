import { expect, test } from "bun:test"
import { pwaBrowserStatusResolve } from "../src/ui/pwa/pwaBrowserStatusResolve.js"

test("reports offline regardless of pending update", () => {
  expect(pwaBrowserStatusResolve({ online: false, updateReady: true })).toBe("offline")
})

test("reports a ready update while online", () => {
  expect(pwaBrowserStatusResolve({ online: true, updateReady: true })).toBe("update-ready")
})

test("reports online otherwise", () => {
  expect(pwaBrowserStatusResolve({ online: true, updateReady: false })).toBe("online")
})
