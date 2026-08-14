import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { sessionRenameControlStateCreate } from "../src/session/ui/sessionRenameControlStateCreate.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("session rename component declares accessible edit and form semantics", async () => {
  const source = await Bun.file(new URL("../src/session/ui/SessionRenameControl.tsx", import.meta.url)).text()

  expect(source).toContain("aria-label={`Rename ")
  expect(source).toContain("state.displayedTitle()")
  expect(source).toContain('aria-label="Rename session"')
  expect(source).toContain('role="alert"')
  expect(source).toContain("onKeyDown={state.inputKeyDown}")
  expect(source).toContain("encodeURIComponent(props.sessionId)")
  expect(source).toContain('<h2 class="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">')
})

test("selected session exposes rename at its Zero-backed title without navigation callbacks", async () => {
  const source = await Bun.file(new URL("../src/ui/SelectedSession.tsx", import.meta.url)).text()

  expect(source).toContain('import { SessionRenameControl } from "../session/ui/SessionRenameControl.js"')
  expect(source).toContain("<SessionRenameControl sessionId={session.id} title={session.title} />")
  expect(source).not.toContain("onRenamed=")
})

test("session rename trims and saves through the existing HTTP contract", async () => {
  const requests: Array<{ body: string | undefined; method: string | undefined; url: string }> = []
  const renamed: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionRenameControlStateCreate({
      fetcher: async (input, init) => {
        requests.push({ body: init?.body?.toString(), method: init?.method, url: String(input) })
        return Response.json({ session: { id: "session/1", title: "Renamed session" } })
      },
      onRenamed: (title) => renamed.push(title),
      sessionId: () => "session/1",
      title: () => "Original session",
    }),
  }))

  root.state.beginEdit()
  root.state.inputUpdate({ currentTarget: { value: "  Renamed session  " } } as InputEvent & {
    currentTarget: HTMLInputElement
  })
  root.state.submit({ preventDefault() {} } as SubmitEvent)
  await tick()

  expect(requests).toEqual([
    { body: JSON.stringify({ title: "Renamed session" }), method: "PATCH", url: "/api/sessions/session%2F1" },
  ])
  expect(root.state.displayedTitle()).toBe("Renamed session")
  expect(root.state.isEditing()).toBe(false)
  expect(renamed).toEqual(["Renamed session"])
  root.dispose()
})

test("session rename validates, cancels, and preserves API errors for correction", async () => {
  let requests = 0
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionRenameControlStateCreate({
      fetcher: async () => {
        requests += 1
        return Response.json({ error: { code: "conflict", message: "The session is archived." } }, { status: 409 })
      },
      sessionId: () => "session-1",
      title: () => "Original session",
    }),
  }))

  root.state.beginEdit()
  root.state.inputUpdate({ currentTarget: { value: "   " } } as InputEvent & { currentTarget: HTMLInputElement })
  root.state.submit({ preventDefault() {} } as SubmitEvent)
  await tick()
  expect(requests).toBe(0)
  expect(root.state.errorMessage()).toBe("Enter a session title.")

  root.state.inputUpdate({ currentTarget: { value: "Unavailable title" } } as InputEvent & {
    currentTarget: HTMLInputElement
  })
  root.state.submit({ preventDefault() {} } as SubmitEvent)
  await tick()
  expect(root.state.errorMessage()).toBe("The session is archived.")
  expect(root.state.isEditing()).toBe(true)

  root.state.cancel()
  expect(root.state.draft()).toBe("Original session")
  expect(root.state.errorMessage()).toBeUndefined()
  expect(root.state.isEditing()).toBe(false)
  root.dispose()
})
