import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { authLogoutStateCreate } from "../src/identity/ui/authLogoutStateCreate.js"
import { authReturnPathResolve } from "../src/identity/ui/authReturnPathResolve.js"
import { authSessionStateCreate } from "../src/identity/ui/authSessionStateCreate.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("the protected bootstrap requests a no-store same-origin session before exposing a user ID", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const root = createRoot((dispose) => ({
    dispose,
    state: authSessionStateCreate({
      fetcher: async (input, init) => {
        requests.push({ url: String(input), init })
        return Response.json({ authenticated: true, userId: "oidc:user-1" })
      },
    }),
  }))

  expect(root.state.status()).toBe("loading")
  expect(root.state.userId()).toBeUndefined()

  await tick()
  expect(requests[0]?.url).toBe("/api/auth/session")
  expect(requests[0]?.init?.cache).toBe("no-store")
  expect(requests[0]?.init?.credentials).toBe("same-origin")
  expect(root.state.status()).toBe("signed-in")
  expect(root.state.userId()).toBe("oidc:user-1")
  root.dispose()
})

test("a 401 bootstrap yields the signed-out state with no user ID", async () => {
  const root = createRoot((dispose) => ({
    dispose,
    state: authSessionStateCreate({
      fetcher: async () => Response.json({ error: { code: "unauthorized", message: "no" } }, { status: 401 }),
    }),
  }))

  await tick()
  expect(root.state.status()).toBe("signed-out")
  expect(root.state.userId()).toBeUndefined()
  root.dispose()
})

test("a failed or invalid session response renders the error state and retries", async () => {
  let attempts = 0
  const root = createRoot((dispose) => ({
    dispose,
    state: authSessionStateCreate({
      fetcher: async () => {
        attempts += 1
        if (attempts === 1) return new Response(null, { status: 500 })
        if (attempts === 2) return Response.json({ authenticated: true })
        return Response.json({ authenticated: true, userId: "oidc:user-2" })
      },
    }),
  }))

  await tick()
  expect(root.state.status()).toBe("error")
  root.state.retry()
  await tick()
  expect(root.state.status()).toBe("error")
  expect(root.state.userId()).toBeUndefined()
  root.state.retry()
  await tick()
  expect(root.state.status()).toBe("signed-in")
  expect(root.state.userId()).toBe("oidc:user-2")
  root.dispose()
})

test("logout revokes the server session, deletes the local Zero cache, clears state, and replaces navigation", async () => {
  const order: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: authLogoutStateCreate({
      fetcher: async (input, init) => {
        order.push(`fetch:${String(input)}:${init?.method}:${init?.credentials}:${init?.cache}`)
        return Response.json({ loggedOut: true })
      },
      navigateToLogin: () => order.push("navigate"),
      sessionClear: () => order.push("clear"),
      zero: () => ({
        delete: async () => {
          order.push("zero-delete")
          return { deleted: [], errors: [] }
        },
      }),
    }),
  }))

  root.state.logout()
  await tick()
  expect(order).toEqual(["fetch:/api/auth/logout:POST:same-origin:no-store", "zero-delete", "clear", "navigate"])
  expect(root.state.busy()).toBe(false)
  root.dispose()
})

test("logout still clears protected state and navigates when the server or Zero cleanup fails", async () => {
  const order: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: authLogoutStateCreate({
      fetcher: async () => {
        throw new Error("offline")
      },
      navigateToLogin: () => order.push("navigate"),
      sessionClear: () => order.push("clear"),
      zero: () => ({ delete: async () => Promise.reject(new Error("blocked")) }),
    }),
  }))

  root.state.logout()
  await tick()
  expect(order).toEqual(["clear", "navigate"])
  root.dispose()
})

test("login return paths keep only known same-origin application routes", () => {
  expect(authReturnPathResolve("/notes")).toBe("/notes")
  expect(authReturnPathResolve("/notes/note-1")).toBe("/notes/note-1")
  expect(authReturnPathResolve(undefined)).toBe("/")
  expect(authReturnPathResolve("")).toBe("/")
  expect(authReturnPathResolve("//evil.test/notes")).toBe("/")
  expect(authReturnPathResolve("https://evil.test/notes")).toBe("/")
  expect(authReturnPathResolve("/notes?session=1")).toBe("/")
  expect(authReturnPathResolve("/%2e%2e/notes")).toBe("/")
  expect(authReturnPathResolve("/unknown")).toBe("/")
  expect(authReturnPathResolve("/login")).toBe("/")
})
