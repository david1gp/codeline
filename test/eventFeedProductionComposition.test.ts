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

test("production session routes forward the signed-in fetcher into list and search state", async () => {
  const applicationRoot = await source("src/ui/ApplicationRoot.tsx")
  const applicationRootState = await source("src/ui/applicationRootStateCreate.ts")
  const authSession = await source("src/identity/ui/authSessionStateCreate.ts")
  const signedInApplication = await source("src/ui/signedInApplicationStateCreate.ts")
  const routeState = await source("src/ui/workspaceRoutePageStateCreate.ts")
  const screenState = await source("src/ui/workspaceScreenStateCreate.ts")
  const sessionList = await source("src/ui/sessionListStateCreate.ts")

  expect(applicationRoot).toContain("const fetcher = fetch")
  expect(applicationRoot).toContain("applicationRootStateCreate({ fetcher })")
  expect(applicationRootState).toContain("authSessionStateCreate({ fetcher: options.fetcher })")
  expect(applicationRoot).toContain("<apiFetchContext.Provider value={fetcher}>")
  expect(applicationRoot).not.toContain("<apiFetchContext.Provider value={state.fetcher}>")
  expect(applicationRoot).toContain("fetcher={fetcher}")
  expect(applicationRoot).toContain("fetch: props.fetcher")
  expect(authSession).toContain("const fetcher = options.fetcher ?? fetch")
  expect(signedInApplication).toContain("const fetcher = options.fetch ?? fetch")
  expect(signedInApplication).toContain("settledSnapshotCacheWrite: sessionSettledCompletionCacheRegistry.write")
  expect(signedInApplication).toContain("return { applicationShell: shell, auth, eventFeed, state }")
  expect(routeState).toContain("const fetcher = useContext(apiFetchContext)")
  expect(routeState).toContain("workspaceScreenStateCreate(navigation, sidebarRoute, { fetcher })")
  expect(screenState).toContain("sessionListStateCreate(() => navigation, sidebarRoute, { fetcher: options.fetcher })")
  expect(sessionList).toContain("const search = sessionSearchStateCreate(window, options)")
})

test("production note routes forward the signed-in fetcher into list, create, and detail state", async () => {
  const notesRoute = await source("src/ui/NotesRoutePage.tsx")
  const newNoteRoute = await source("src/ui/NewNoteRoutePage.tsx")
  const noteRoute = await source("src/ui/NoteRoutePage.tsx")
  const notesState = await source("src/note/ui/notesPageStateCreate.ts")
  const newNoteState = await source("src/note/ui/newNotePageStateCreate.ts")
  const workspaceState = await source("src/note/ui/noteWorkspaceScreenStateCreate.ts")

  for (const route of [notesRoute, newNoteRoute, noteRoute]) {
    expect(route).toContain("const fetcher = useContext(apiFetchContext)")
  }
  expect(notesRoute).toContain("notesPageStateCreate({ fetcher })")
  expect(newNoteRoute).toContain("newNotePageStateCreate({ fetcher })")
  expect(noteRoute).toContain("noteWorkspaceScreenStateCreate({ fetcher, noteId")
  expect(notesState).toContain("noteListFetch({ fetch: fetcher, signal })")
  expect(newNoteState).toContain("noteCreateRequest(")
  expect(newNoteState).toContain("{ fetch: fetcher }")
  expect(workspaceState).toContain("fetcher: options.fetcher")
})
