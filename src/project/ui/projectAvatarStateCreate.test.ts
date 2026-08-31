import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { projectAvatarStateCreate } = await import("./projectAvatarStateCreate.js")

test("project avatar falls back after a favicon error and retries a replacement URL", () => {
  const root = createRoot((dispose) => {
    const [faviconUrl, faviconUrlSet] = createSignal<string | null>("/favicon.ico?revision=1")
    const state = projectAvatarStateCreate({ faviconUrl, name: () => "Codeline" })
    return { dispose, faviconUrlSet, state }
  })

  expect(root.state.showFavicon()).toBe(true)
  root.state.faviconError()
  expect(root.state.showFavicon()).toBe(false)
  expect(root.state.letter()).toBe("C")

  root.faviconUrlSet("/favicon.ico?revision=2")
  expect(root.state.showFavicon()).toBe(true)
  root.dispose()
})
