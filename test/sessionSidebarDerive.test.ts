import { expect, test } from "bun:test"
import { sessionSidebarDerive } from "../src/ui/sessionSidebarDerive.js"
import { sessionUpdatedAtFormat } from "../src/ui/sessionUpdatedAtFormat.js"

const now = Date.parse("2026-08-15T12:00:00.000Z")

function session(input: Partial<Parameters<typeof sessionSidebarDerive>[0][number]> & { id: string }) {
  return {
    id: input.id,
    parentSessionId: null,
    projectPath: input.projectPath ?? "~",
    title: input.title ?? input.id,
    updatedAt: input.updatedAt ?? now,
    watched: input.watched ?? true,
    working: input.working ?? false,
  }
}

test("sidebar derives flat recent and watched lists in stable active-session order", () => {
  const derived = sessionSidebarDerive(
    [
      session({ id: "older", updatedAt: now - 60_000 }),
      session({ id: "newer-unwatched", updatedAt: now, watched: false }),
      session({ id: "newer-watched", updatedAt: now, watched: true }),
    ],
    [],
    now,
  )

  expect(derived.recent.map((row) => row.session.id)).toEqual(["newer-watched", "newer-unwatched", "older"])
  expect(derived.watched.map((row) => row.session.id)).toEqual(["newer-watched", "older"])
  expect(derived.recent.map((row) => [row.projectLabel, row.updatedAtRelative])).toEqual([
    ["Home", "just now"],
    ["Home", "just now"],
    ["Home", "1m"],
  ])
})

test("sidebar groups active sessions by project while preserving recent order", () => {
  const derived = sessionSidebarDerive(
    [
      session({ id: "work-old", projectPath: "/workspace/codeline", updatedAt: now - 60_000 }),
      session({ id: "home", projectPath: "~", updatedAt: now }),
      session({ id: "work-new", projectPath: "/workspace/codeline", updatedAt: now - 10_000 }),
    ],
    [],
    now,
  )

  expect(derived.projects.map((group) => group.projectLabel)).toEqual(["Home", "codeline"])
  expect(derived.projects[1]?.sessions.map((row) => row.session.id)).toEqual(["work-new", "work-old"])
})

test("sidebar keeps project groups stable when session recency changes", () => {
  const derived = sessionSidebarDerive(
    [
      session({ id: "zeta", projectPath: "/workspace/zeta", updatedAt: now }),
      session({ id: "alpha", projectPath: "/workspace/alpha", updatedAt: now - 60_000 }),
    ],
    [],
    now,
  )

  expect(derived.projects.map((group) => group.projectLabel)).toEqual(["alpha", "zeta"])
})

test("sidebar adapts search results without losing row metadata", () => {
  const derived = sessionSidebarDerive(
    [],
    [
      {
        session: {
          id: "search-result",
          projectPath: "/workspace/codeline",
          title: "Search result",
          updatedAt: new Date(now - 3_600_000).toISOString(),
          watched: false,
        },
      },
    ],
    now,
  )

  expect(derived.search[0]).toMatchObject({
    projectLabel: "codeline",
    session: { id: "search-result", projectPath: "/workspace/codeline", watched: false },
    updatedAtRelative: "1h",
  })
})

test("updated timestamp titles contain local and UTC absolute timestamps", () => {
  const formatted = sessionUpdatedAtFormat("2026-08-15T12:00:00.000Z", now)

  expect(formatted.relative).toBe("just now")
  expect(formatted.title).toContain("Local:")
  expect(formatted.title).toContain("UTC:")
  expect(formatted.title).toContain("2026-08-15T12:00:00.000Z")
})
