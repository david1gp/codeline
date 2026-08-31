import { expect, test } from "bun:test"
import { sessionSidebarDerive } from "../src/ui/sessionSidebarDerive.js"
import { sessionUpdatedAtFormat } from "../src/ui/sessionUpdatedAtFormat.js"

const now = Date.parse("2026-08-15T12:00:00.000Z")

function session(input: Partial<Parameters<typeof sessionSidebarDerive>[0][number]> & { id: string }) {
  return {
    id: input.id,
    parentSessionId: null,
    projectId: input.projectId,
    projectPath: input.projectPath ?? "~",
    title: input.title ?? input.id,
    updatedAt: input.updatedAt ?? now,
    pinned: input.pinned ?? true,
    working: input.working ?? false,
  }
}

test("sidebar derives flat recent and pinned lists in stable active-session order", () => {
  const derived = sessionSidebarDerive(
    [
      session({ id: "older", updatedAt: now - 60_000 }),
      session({ id: "newer-unpinned", updatedAt: now, pinned: false }),
      session({ id: "newer-pinned", updatedAt: now, pinned: true }),
    ],
    [],
    now,
  )

  expect(derived.recent.map((row) => row.session.id)).toEqual(["newer-unpinned", "newer-pinned", "older"])
  expect(derived.pinned.map((row) => row.session.id)).toEqual(["newer-pinned", "older"])
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
        archivedAt: null,
        createdAt: new Date(now - 3_600_000).toISOString(),
        id: "search-result",
        metadata: {},
        parentSessionId: null,
        pinned: false,
        projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fbc",
        primaryAgentId: "agent-1",
        projectPath: "/workspace/codeline",
        revision: 1,
        serverId: "server-1",
        title: "Search result",
        updatedAt: new Date(now - 3_600_000).toISOString(),
      },
    ],
    now,
  )

  expect(derived.search[0]).toMatchObject({
    projectLabel: "codeline",
    session: {
      id: "search-result",
      pinned: false,
      projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fbc",
      projectPath: "/workspace/codeline",
    },
    updatedAtRelative: "1h",
  })
})

test("sidebar merges registered projects with zero sessions alongside historical session projects", () => {
  const regId1 = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fbd"
  const regId2 = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fbe"
  const derived = sessionSidebarDerive(
    [
      session({ id: "s-1", projectId: regId1, projectPath: "/workspace/codeline", updatedAt: now }),
      session({ id: "s-2", projectPath: "/workspace/historical", updatedAt: now - 30_000 }),
    ],
    [],
    now,
    {},
    [
      { available: true, faviconUrl: null, id: regId1, label: "codeline", parentFolder: null },
      { available: false, faviconUrl: null, id: regId2, label: "empty-registered", parentFolder: null },
    ],
  )

  expect(derived.projects).toHaveLength(3)
  expect(
    derived.projects.map((p) => ({ available: p.available, label: p.projectLabel, sessionCount: p.sessions.length })),
  ).toEqual([
    { available: true, label: "codeline", sessionCount: 1 },
    { available: false, label: "empty-registered", sessionCount: 0 },
    { available: true, label: "historical", sessionCount: 1 },
  ])
  expect(derived.projects[0]?.projectId).toBe(regId1)
  expect(derived.projects[1]?.projectId).toBe(regId2)
  expect(derived.projects[2]?.projectId).toBeUndefined()
})

test("sidebar keeps duplicate registered labels and unmatched historical sessions separate", () => {
  const firstProjectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fbf"
  const secondProjectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc0"
  const derived = sessionSidebarDerive(
    [
      session({ id: "first", projectId: firstProjectId, projectPath: "/workspace/first", updatedAt: now }),
      session({ id: "second", projectId: secondProjectId, projectPath: "/other/first", updatedAt: now - 1_000 }),
      session({ id: "historical", projectPath: "/legacy/first", updatedAt: now - 2_000 }),
    ],
    [],
    now,
    { "/legacy/first": "first" },
    [
      { available: true, faviconUrl: null, id: firstProjectId, label: "first", parentFolder: null },
      { available: true, faviconUrl: null, id: secondProjectId, label: "first", parentFolder: null },
    ],
  )

  expect(
    derived.projects.find((project) => project.projectId === firstProjectId)?.sessions.map((row) => row.session.id),
  ).toEqual(["first"])
  expect(
    derived.projects.find((project) => project.projectId === secondProjectId)?.sessions.map((row) => row.session.id),
  ).toEqual(["second"])
  const historical = derived.projects.find((project) => project.projectPath === "/legacy/first")
  expect(historical?.projectId).toBeUndefined()
  expect(historical).toMatchObject({
    projectLabel: "first",
    sessions: [{ session: { id: "historical" } }],
  })
})

test("updated timestamp titles contain local and UTC absolute timestamps", () => {
  const formatted = sessionUpdatedAtFormat("2026-08-15T12:00:00.000Z", now)

  expect(formatted.relative).toBe("just now")
  expect(formatted.title).toContain("Local:")
  expect(formatted.title).toContain("UTC:")
  expect(formatted.title).toContain("2026-08-15T12:00:00.000Z")
})

test("sidebar groups registered projects into user folders while isolating uncategorized projects", () => {
  const folderId1 = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fd0"
  const folderId2 = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fd1"
  const regId1 = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fd2"
  const regId2 = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fd3"
  const regId3 = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fd4"
  const regId4 = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fd5"

  const derived = sessionSidebarDerive(
    [
      session({ id: "s-1", projectId: regId1, projectPath: "/work/p1", updatedAt: now }),
      session({ id: "s-2", projectId: regId2, projectPath: "/work/p2", updatedAt: now - 10_000 }),
      session({ id: "s-3", projectId: regId3, projectPath: "/work/p3", updatedAt: now - 20_000 }),
      session({ id: "s-4", projectId: regId4, projectPath: "/work/p4", updatedAt: now - 25_000 }),
      session({ id: "s-hist", projectPath: "/legacy/hist", updatedAt: now - 30_000 }),
    ],
    [],
    now,
    {},
    [
      {
        available: true,
        faviconUrl: null,
        folderId: folderId1,
        id: regId1,
        label: "Project One",
        parentFolder: { id: folderId1, label: "Work" },
      },
      {
        available: true,
        faviconUrl: null,
        folderId: folderId1,
        id: regId2,
        label: "Project Two",
        parentFolder: { id: folderId1, label: "Work" },
      },
      {
        available: true,
        faviconUrl: null,
        folderId: null,
        id: regId3,
        label: "Unassigned Project",
        parentFolder: null,
      },
      {
        available: true,
        faviconUrl: null,
        folderId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fff",
        id: regId4,
        label: "Parent Folder Project",
        parentFolder: { id: folderId1, label: "Work" },
      },
    ],
    [
      { active: true, id: folderId1, label: "Work", unseenEnded: false },
      { active: false, id: folderId2, label: "Empty Folder", unseenEnded: true },
    ],
  )

  expect(derived.folders).toHaveLength(2)
  expect(derived.folders[0]?.id).toBe(folderId1)
  expect(derived.folders[0]?.label).toBe("Work")
  expect(derived.folders[0]?.active).toBe(true)
  expect(derived.folders[0]?.unseenEnded).toBe(false)
  expect(derived.folders[0]?.projects.map((p) => p.projectId)).toEqual([regId4, regId1, regId2])

  expect(derived.folders[1]?.id).toBe(folderId2)
  expect(derived.folders[1]?.label).toBe("Empty Folder")
  expect(derived.folders[1]?.active).toBe(false)
  expect(derived.folders[1]?.unseenEnded).toBe(true)
  expect(derived.folders[1]?.projects).toHaveLength(0)

  expect(derived.uncategorizedProjects.map((p) => p.projectLabel)).toEqual(["hist", "Unassigned Project"])
})
