import { expect, test } from "bun:test"
import { noteProjectChoicesResolve } from "../src/note/ui/noteProjectChoicesResolve.js"

const availableFirst = {
  available: true,
  faviconUrl: null,
  id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fad",
  label: "alpha",
  parentFolder: null,
}
const availableSecond = {
  available: true,
  faviconUrl: null,
  id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fae",
  label: "beta",
  parentFolder: null,
}
const unavailableRegistered = {
  available: false,
  faviconUrl: null,
  id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1faf",
  label: "gamma",
  parentFolder: null,
}

const projects = [availableFirst, availableSecond, unavailableRegistered]

test("note project choices offer only available registered projects for unassigned notes", () => {
  expect(noteProjectChoicesResolve(projects, null)).toEqual([availableFirst, availableSecond])
})

test("note project choices store opaque IDs and display registered labels for available projects", () => {
  expect(noteProjectChoicesResolve(projects, availableSecond.id)).toEqual([availableFirst, availableSecond])
})

test("note project choices preserve an existing unavailable assignment without offering other unavailable projects", () => {
  expect(noteProjectChoicesResolve(projects, unavailableRegistered.id)).toEqual([
    unavailableRegistered,
    availableFirst,
    availableSecond,
  ])
})

test("note project choices preserve an existing historical assignment absent from registry", () => {
  const historicalProjectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb3"
  expect(noteProjectChoicesResolve(projects, historicalProjectId, "legacy/project")).toEqual([
    { available: false, faviconUrl: null, id: historicalProjectId, label: "legacy/project", parentFolder: null },
    availableFirst,
    availableSecond,
  ])
})
