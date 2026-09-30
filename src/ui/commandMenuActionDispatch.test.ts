import { expect, test } from "bun:test"
import type { CommandIntent } from "./commandIntent.js"
import { commandMenuActionDispatch } from "./commandMenuActionDispatch.js"

test("command menu dispatches new project through the app-level command dispatcher without workspace actions", () => {
  const dispatched: CommandIntent[] = []
  const navigation = { commandDispatch: (intent: CommandIntent) => dispatched.push(intent) }

  commandMenuActionDispatch({ kind: "new-project" }, navigation.commandDispatch)

  expect(dispatched).toEqual([{ kind: "new-project" }])
})
