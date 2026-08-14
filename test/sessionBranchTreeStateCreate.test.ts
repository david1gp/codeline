import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import { sessionBranchTreeBuild } from "../src/ui/sessionBranchTreeBuild.js"
import { sessionBranchTreeLeafIdsResolve } from "../src/ui/sessionBranchTreeLeafIdsResolve.js"
import { sessionBranchTreeLeafSelectionResolve } from "../src/ui/sessionBranchTreeLeafSelectionResolve.js"
import { sessionBranchTreeSelectedAncestryResolve } from "../src/ui/sessionBranchTreeSelectedAncestryResolve.js"
import { sessionBranchTreeStateCreate } from "../src/ui/sessionBranchTreeStateCreate.js"

const sessionCreate = (id: string, updatedAt: string, parentSessionId?: string) => ({
  id,
  parentSessionId,
  title: id,
  updatedAt,
})

test("session branch tree orders each level and keeps missing parents as orphans", () => {
  const tree = sessionBranchTreeBuild([
    sessionCreate("child-old", "2026-08-14T08:00:00.000Z", "root"),
    sessionCreate("orphan-child", "2026-08-14T11:00:00.000Z", "missing"),
    sessionCreate("root", "2026-08-14T09:00:00.000Z"),
    sessionCreate("child-new", "2026-08-14T08:00:00.000Z", "root"),
    sessionCreate("orphan", "2026-08-14T10:00:00.000Z", "missing"),
    sessionCreate("same-time-a", "2026-08-14T07:00:00.000Z"),
    sessionCreate("same-time-b", "2026-08-14T07:00:00.000Z"),
  ])

  expect(tree.roots.map((node) => node.session.id)).toEqual([
    "orphan-child",
    "orphan",
    "root",
    "same-time-b",
    "same-time-a",
  ])
  expect(tree.orphans.map((node) => node.session.id)).toEqual(["orphan-child", "orphan"])
  expect(tree.roots.find((node) => node.session.id === "root")?.children.map((node) => node.session.id)).toEqual([
    "child-old",
    "child-new",
  ])
})

test("session branch tree treats cycles as orphan roots", () => {
  const tree = sessionBranchTreeBuild([
    sessionCreate("cycle-a", "2026-08-14T08:00:00.000Z", "cycle-b"),
    sessionCreate("cycle-b", "2026-08-14T09:00:00.000Z", "cycle-a"),
  ])

  expect(tree.roots.map((node) => node.session.id)).toEqual(["cycle-b", "cycle-a"])
  expect(tree.orphans.map((node) => node.session.id)).toEqual(["cycle-b", "cycle-a"])
})

test("session branch tree resolves selected ancestry and leaves without rendering", () => {
  const tree = sessionBranchTreeBuild([
    sessionCreate("root", "2026-08-14T09:00:00.000Z"),
    sessionCreate("branch", "2026-08-14T08:00:00.000Z", "root"),
    sessionCreate("leaf-a", "2026-08-14T07:00:00.000Z", "branch"),
    sessionCreate("leaf-b", "2026-08-14T06:00:00.000Z", "branch"),
  ])

  expect(sessionBranchTreeSelectedAncestryResolve(tree.roots, "leaf-a")).toEqual(["root", "branch", "leaf-a"])
  expect(sessionBranchTreeSelectedAncestryResolve(tree.roots, "unknown")).toEqual([])
  expect(sessionBranchTreeLeafIdsResolve(tree.roots)).toEqual(["leaf-a", "leaf-b"])
  expect(sessionBranchTreeLeafSelectionResolve(tree.roots, "branch")).toBeNull()
  expect(sessionBranchTreeLeafSelectionResolve(tree.roots, "leaf-b")).toBe("leaf-b")
})

test("session branch tree state accepts only leaf selections and follows session updates", () => {
  const [sessions, setSessions] = createSignal([
    sessionCreate("root", "2026-08-14T09:00:00.000Z"),
    sessionCreate("leaf", "2026-08-14T08:00:00.000Z", "root"),
  ])
  const dispose = createRoot((rootDispose) => {
    const state = sessionBranchTreeStateCreate({ sessions })
    state.selectLeaf("root")
    expect(state.activeLeafId()).toBeNull()
    state.selectLeaf("leaf")
    expect(state.activeLeafId()).toBe("leaf")
    expect(state.selectedAncestry()).toEqual(["root", "leaf"])

    setSessions([sessionCreate("root", "2026-08-14T09:00:00.000Z")])
    expect(state.activeLeafId()).toBeNull()
    expect(state.selectedAncestry()).toEqual([])
    return rootDispose
  })
  dispose()
})

test("session branch tree state follows URL selection ancestry without replacing leaf state", () => {
  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>("leaf-b")
  const dispose = createRoot((rootDispose) => {
    const state = sessionBranchTreeStateCreate({
      selectedSessionId,
      sessions: () => [
        sessionCreate("root", "2026-08-14T09:00:00.000Z"),
        sessionCreate("branch", "2026-08-14T08:00:00.000Z", "root"),
        sessionCreate("leaf-a", "2026-08-14T07:00:00.000Z", "branch"),
        sessionCreate("leaf-b", "2026-08-14T06:00:00.000Z", "branch"),
      ],
    })

    expect(state.leafIds()).toEqual(["leaf-a", "leaf-b"])
    expect(state.selectedAncestry()).toEqual(["root", "branch", "leaf-b"])
    setSelectedSessionId("leaf-a")
    expect(state.selectedAncestry()).toEqual(["root", "branch", "leaf-a"])
    expect(state.activeLeafId()).toBeNull()

    return rootDispose
  })
  dispose()
})
