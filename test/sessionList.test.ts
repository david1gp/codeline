import { expect, test } from "bun:test"

test("SessionList wires the load-more view boundary to sidebar pagination state", async () => {
  const source = await Bun.file(new URL("../src/ui/SessionList.tsx", import.meta.url)).text()
  const loadMoreStart = source.indexOf(
    '<Show when={props.state.sidebar.activeTab() !== "search" && props.state.sidebar.canLoadMore()}>',
  )
  const loadMoreEnd = source.indexOf("</Show>", loadMoreStart)
  const loadMoreSource = source.slice(loadMoreStart, loadMoreEnd)

  expect(loadMoreStart).toBeGreaterThan(-1)
  expect(loadMoreEnd).toBeGreaterThan(loadMoreStart)
  expect(loadMoreSource).toContain("disabled={props.state.sidebar.isLoadingMore()}")
  expect(loadMoreSource).toContain("onClick={props.state.sidebar.loadMore}")
  expect(loadMoreSource).toContain('{props.state.sidebar.isLoadingMore() ? "Loading..." : "Load more"}')
})

test("SessionList configures Delete action for historical projects and Remove for registered projects", async () => {
  const source = await Bun.file(new URL("../src/ui/SessionList.tsx", import.meta.url)).text()

  expect(source).toContain('deleteLabel={project.projectId !== undefined ? "Remove" : "Delete"}')
  expect(source).toContain("props.state.actions.projectRemoveOpen(project)")
  expect(source).toContain("props.state.actions.projectDeleteOpen(project)")
})

test("SessionList renders nested folder and project details with accessible status dots and new folder button", async () => {
  const source = await Bun.file(new URL("../src/ui/SessionList.tsx", import.meta.url)).text()

  // New folder button
  expect(source).toContain('title="New folder"')
  expect(source).toContain("props.state.actions.folderCreateOpen()")

  // Folder details and summary
  expect(source).toContain('class="group/folder"')
  expect(source).toContain("open={props.state.folderIsOpen(folder)}")
  expect(source).toContain("props.state.folderToggle(folder.id, event.currentTarget.open)")

  // Accessible status dot (green when active else blue when unseenEnded)
  expect(source).toContain("<Show when={folder.active || folder.unseenEnded}>")
  expect(source).toContain('"bg-emerald-500": folder.active')
  expect(source).toContain('"bg-blue-500": !folder.active && folder.unseenEnded')
  expect(source).toContain('role="status"')

  // Folder actions (rename, delete)
  expect(source).toContain("Folder actions for")
  expect(source).toContain("onRename={() => props.state.actions.folderRenameOpen(folder)}")
  expect(source).toContain("onDelete={() => props.state.actions.folderDeleteOpen(folder)}")

  // Move action for registered projects
  expect(source).toContain("onMove={")
  expect(source).toContain("props.state.actions.projectMoveOpen(project)")
})
