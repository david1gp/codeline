import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { accountPopoverStateCreate } from "../src/identity/ui/accountPopoverStateCreate.js"

test("account popover tracks open state and closes before sign-out", () => {
  const events: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: accountPopoverStateCreate(() => ({
      busy: () => false,
      displayName: () => "User One",
      logout: () => events.push("logout"),
      userId: () => "oidc:user-1",
    })),
  }))

  expect(root.state.isOpen()).toBe(false)
  root.state.openChange(true)
  expect(root.state.isOpen()).toBe(true)
  root.state.logout()

  expect(root.state.isOpen()).toBe(false)
  expect(events).toEqual(["logout"])
  root.dispose()
})

test("account popover renders identity details and wires its sign-out action", async () => {
  const source = await Bun.file(new URL("../src/identity/ui/AccountPopover.tsx", import.meta.url)).text()

  expect(source).toContain("props.auth.displayName()")
  expect(source).toContain("props.auth.userId()")
  expect(source).toContain("onClick={state.logout}")
  expect(source).toContain("disabled={props.auth.busy()}")
})
