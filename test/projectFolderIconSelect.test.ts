import { expect, test } from "bun:test"
import { mdiFolderOpenOutline } from "@adaptive-ds/mdi/mdiFolderOpenOutline.js"
import { mdiFolderOutline } from "@adaptive-ds/mdi/mdiFolderOutline.js"
import { projectFolderIconSelect } from "../src/project/ui/projectFolderIconSelect.js"

test("open folders use the open outline icon and closed folders the closed one", () => {
  expect(projectFolderIconSelect(true)).toBe(mdiFolderOpenOutline)
  expect(projectFolderIconSelect(false)).toBe(mdiFolderOutline)
  expect(projectFolderIconSelect(true)).not.toBe(projectFolderIconSelect(false))
})

test("SessionList folder rows select the icon from the disclosure accessor", async () => {
  const source = await Bun.file(new URL("../src/ui/SessionList.tsx", import.meta.url)).text()
  expect(source).toContain("projectFolderIconSelect(props.state.folderIsOpen(folder))")
  expect(source).not.toContain("path={mdiFolderOutline}")
  expect(source).toContain("open={props.state.folderIsOpen(folder)}")
  expect(source).toContain("props.state.folderToggle(folder.id, event.currentTarget.open)")
})
