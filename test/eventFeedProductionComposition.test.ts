import { expect, test } from "bun:test"

async function source(path: string): Promise<string> {
  return Bun.file(new URL(`../${path}`, import.meta.url)).text()
}

test("the signed-in shell owns one feed, forwards status, and disposes it", async () => {
  const applicationRoot = await source("src/ui/ApplicationRoot.tsx")
  const signedInApplication = await source("src/ui/signedInApplicationStateCreate.ts")
  const appShell = await source("src/ui/appShellStateCreate.ts")

  expect(applicationRoot).toContain("eventFeedCoordinatorContext.Provider")
  expect(signedInApplication.match(/eventFeedCoordinatorStateCreate\(/g)).toHaveLength(1)
  expect(signedInApplication).toContain("connectionIndicator: state.events")
  expect(signedInApplication).toContain("onCleanup(eventFeed.close)")
  expect(appShell).toContain("ReturnType<typeof eventFeedConnectionIndicatorStateCreate>")
})

test("production HTTP states register every visible feed refresh seam", async () => {
  const sessionList = await source("src/ui/sessionListStateCreate.ts")
  const selectedSession = await source("src/ui/selectedSessionStateCreate.ts")
  const notes = await source("src/note/ui/notesPageStateCreate.ts")
  const noteWorkspace = await source("src/note/ui/noteWorkspacePageStateCreate.ts")
  const noteDetail = await source("src/note/ui/notePageStateCreate.ts")

  expect(sessionList).toContain("registerSessionList(revalidate)")
  expect(selectedSession).toContain("registerSelectedSession")
  expect(selectedSession).toContain("registerSelectedMessages")
  expect(selectedSession).toContain("registerSelectedDelegations")
  expect(selectedSession).toContain("registerSelectedStream")
  expect(notes).toContain("registerNoteList(revalidate)")
  expect(notes).toContain("onCleanup(unregisterEventFeed)")
  expect(noteWorkspace).toContain("registerNoteList(revalidate)")
  expect(noteWorkspace).toContain("onCleanup(unregisterEventFeed)")
  expect(noteDetail).toContain("registerNoteDetail({ noteId, refresh: revalidate })")
  expect(noteDetail).toContain("onCleanup(unregisterEventFeed)")
  expect(selectedSession).toContain("onCleanup(() => {")
})
