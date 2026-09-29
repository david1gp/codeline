import { expect, test } from "bun:test"
import { sessionSidebarNewOrderApply } from "./sessionSidebarNewOrderApply.js"

test("saved sidebar order leads while paginated additions append in API order", () => {
  const firstPage = [{ id: "saved-b" }, { id: "saved-a" }]
  const afterPageLoad = [...firstPage, { id: "new-a" }, { id: "new-b" }]

  expect(sessionSidebarNewOrderApply(firstPage, ["saved-a", "removed", "saved-b"]).map(({ id }) => id)).toEqual([
    "saved-a",
    "saved-b",
  ])
  expect(sessionSidebarNewOrderApply(afterPageLoad, ["saved-a", "removed", "saved-b"]).map(({ id }) => id)).toEqual([
    "saved-a",
    "saved-b",
    "new-a",
    "new-b",
  ])
})
