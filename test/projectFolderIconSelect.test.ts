import { expect, test } from "bun:test"
import { projectFolderIconSelect } from "../src/project/ui/projectFolderIconSelect.js"
import { applicationIcon } from "../src/ui/applicationIcon.js"

test("open folders use the open outline icon and closed folders the closed one", () => {
  expect(projectFolderIconSelect(true)).toBe(applicationIcon.folderOpen)
  expect(projectFolderIconSelect(false)).toBe(applicationIcon.folder)
  expect(projectFolderIconSelect(true)).not.toBe(projectFolderIconSelect(false))
})

test("SessionList folder rows select the icon from the disclosure accessor", async () => {
  const source = await Bun.file(new URL("../src/ui/SessionList.tsx", import.meta.url)).text()
  expect(source).toContain("projectFolderIconSelect(props.state.folderIsOpen(folder))")
  expect(source).not.toContain("path={applicationIcon.folder}")
  expect(source).toContain("open={props.state.folderIsOpen(folder)}")
  expect(source).toContain("props.state.folderToggle(folder.id, event.currentTarget.open)")
})
