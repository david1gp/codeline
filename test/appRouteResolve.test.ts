import { expect, test } from "bun:test"
import { appRouteResolve } from "../src/ui/appRouteResolve.js"

test("app routes the project files surface without changing workspace fallbacks", () => {
  expect(appRouteResolve("/files")).toBe("files")
  expect(appRouteResolve("/notes")).toBe("notes")
  expect(appRouteResolve("/notes/new")).toBe("notes-new")
  expect(appRouteResolve("/notes/note-1")).toBe("note")
  expect(appRouteResolve("/notes/")).toBe("workspace")
  expect(appRouteResolve("/")).toBe("workspace")
  expect(appRouteResolve("/unknown")).toBe("workspace")
})
