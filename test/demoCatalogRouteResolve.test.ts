import { expect, test } from "bun:test"
import { demoCatalogRouteResolve } from "../src/ui/demo/demoCatalogRouteResolve.js"

test("demo catalog resolves its index, sections, canonical scenarios, and legacy scenarios", () => {
  expect(demoCatalogRouteResolve("/demo")).toEqual({ kind: "index" })
  expect(demoCatalogRouteResolve("/demo/components")).toMatchObject({ kind: "index", section: "components" })
  expect(demoCatalogRouteResolve("/demo/screens/streaming")).toMatchObject({
    kind: "scenario",
    scenario: { slug: "streaming" },
  })
  expect(demoCatalogRouteResolve("/demo/streaming")).toMatchObject({
    kind: "scenario",
    scenario: { slug: "streaming" },
  })
  expect(demoCatalogRouteResolve("/demo/not-a-real-scenario")).toEqual({ kind: "index" })
})

test("demo catalog resolves specimens with a validated variant", () => {
  expect(demoCatalogRouteResolve("/demo/screens/workspace-screen")).toMatchObject({
    kind: "specimen",
    specimen: { slug: "workspace-screen" },
    variant: "ready",
  })
  expect(demoCatalogRouteResolve("/demo/components/session-list", "error")).toMatchObject({
    kind: "specimen",
    specimen: { slug: "session-list" },
    variant: "error",
  })
  expect(demoCatalogRouteResolve("/demo/components/session-chat", "loading")).toMatchObject({
    kind: "specimen",
    variant: "ready",
  })
  expect(demoCatalogRouteResolve("/demo/components/session-list", "nonsense")).toMatchObject({ variant: "ready" })
})

test("demo catalog resolves the note screen family and its editing variant", () => {
  expect(demoCatalogRouteResolve("/demo/screens/notes-screen", "empty")).toMatchObject({
    kind: "specimen",
    specimen: { slug: "notes-screen" },
    variant: "empty",
  })
  expect(demoCatalogRouteResolve("/demo/screens/new-note-screen", "editing")).toMatchObject({
    specimen: { slug: "new-note-screen" },
    variant: "editing",
  })
  expect(demoCatalogRouteResolve("/demo/screens/note-workspace-screen", "error")).toMatchObject({
    specimen: { slug: "note-workspace-screen" },
    variant: "error",
  })
  expect(demoCatalogRouteResolve("/demo/components/note-content-field")).toMatchObject({
    specimen: { slug: "note-content-field" },
    variant: "ready",
  })
  // The switcher does not model failure, so an unsupported variant falls back.
  expect(demoCatalogRouteResolve("/demo/components/note-view-mode-switcher", "error")).toMatchObject({
    variant: "ready",
  })
})
