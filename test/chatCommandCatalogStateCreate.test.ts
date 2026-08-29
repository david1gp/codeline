import { expect, mock, test } from "bun:test"
import { createHash } from "node:crypto"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { chatCommandCatalogStateCreate } = await import("../src/ui/chatCommandCatalogStateCreate.js")

const digest = `sha256-${createHash("sha256").update("catalog").digest("hex")}`
const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fa8"

const catalogBody = {
  collisions: [],
  commands: [
    {
      description: "Review a change",
      name: "review",
      path: ".agents/commands/review.md",
      precedence: 1,
      size: 12,
      source: "project" as const,
      template: "Review $1.",
      templateDigest: digest,
      validation: "valid" as const,
    },
  ],
  diagnostics: [],
  digest,
  projectId,
  roots: [],
  version: 1 as const,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status })
}

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 5))
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

function stateCreate(options: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isBashEnabled?: boolean
  isEnabled?: boolean
  isOnline?: boolean
  projectId?: string | null
  projectPath?: string | null
}) {
  const [projectId] = createSignal(options.projectId ?? null)
  const [projectPath] = createSignal(options.projectPath === undefined ? "/tmp/project" : options.projectPath)
  let state: ReturnType<typeof chatCommandCatalogStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = chatCommandCatalogStateCreate({
      fetch: options.fetch,
      isBashEnabled: () => options.isBashEnabled ?? false,
      isEnabled: () => options.isEnabled ?? true,
      isOnline: () => options.isOnline ?? true,
      projectId,
      projectPath,
    })
    return rootDispose
  })
  return { dispose, state: state! }
}

test("resolves the project identity then reads the project-scoped command catalog", async () => {
  const requested: string[] = []
  const { dispose, state } = stateCreate({
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input.toString()
      requested.push(url)
      if (url.includes("/project/identity")) return jsonResponse({ id: projectId, label: "project" })
      return jsonResponse(catalogBody)
    },
  })

  expect(state.status()).toBe("loading")
  await settle()

  expect(state.status()).toBe("ready")
  expect(state.commands().map(({ name }) => name)).toEqual(["review"])
  expect(state.errorMessage()).toBeUndefined()
  expect(requested.some((url) => url.includes("/api/project/identity"))).toBe(true)
  expect(requested.some((url) => url.includes(`/api/project/commands/catalog`) && url.includes(projectId))).toBe(true)
  // The browser never scans command paths itself.
  expect(requested.every((url) => !url.includes(".agents/commands"))).toBe(true)

  dispose()
})

test("a registered project id reads the command catalog without an identity path lookup", async () => {
  const requested: string[] = []
  const { dispose, state } = stateCreate({
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input.toString()
      requested.push(url)
      return jsonResponse(catalogBody)
    },
    projectId,
    projectPath: null,
  })

  await settle()

  expect(state.status()).toBe("ready")
  expect(requested.some((url) => url.includes("/api/project/identity"))).toBe(false)
  expect(requested.some((url) => url.includes(`/api/project/commands/catalog`) && url.includes(projectId))).toBe(true)
  dispose()
})

test("a catalog failure is reported as an error with a retryable state", async () => {
  let attempts = 0
  const { dispose, state } = stateCreate({
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.includes("/project/identity")) return jsonResponse({ id: projectId, label: "project" })
      attempts += 1
      return jsonResponse({ error: { code: "internal_server_error", message: "boom" } }, 500)
    },
  })

  await settle()
  expect(state.status()).toBe("error")
  expect(state.errorMessage()).toBeDefined()
  expect(state.commands()).toEqual([])

  const before = attempts
  state.retry()
  await settle()
  expect(attempts).toBeGreaterThan(before)

  dispose()
})

test("a failed project identity read surfaces its own error message", async () => {
  const { dispose, state } = stateCreate({
    fetch: async () => jsonResponse({ error: { code: "not_found", message: "missing" } }, 404),
  })

  await settle()
  expect(state.status()).toBe("error")
  expect(state.errorMessage()).toBeDefined()

  dispose()
})

test("the catalog is unavailable without a project, while offline, or when disabled", async () => {
  let calls = 0
  const fetchImplementation = async () => {
    calls += 1
    return jsonResponse({ id: projectId, label: "project" })
  }

  const noProject = stateCreate({ fetch: fetchImplementation, projectPath: null })
  await settle()
  expect(noProject.state.status()).toBe("unavailable")
  noProject.dispose()

  const offline = stateCreate({ fetch: fetchImplementation, isOnline: false })
  expect(offline.state.status()).toBe("unavailable")
  offline.dispose()

  const disabled = stateCreate({ fetch: fetchImplementation, isEnabled: false })
  expect(disabled.state.status()).toBe("unavailable")
  disabled.dispose()

  expect(calls).toBe(0)
})

test("the primary agent's bash enablement is projected for interpolation validation", () => {
  const enabled = stateCreate({ fetch: async () => jsonResponse(catalogBody), isBashEnabled: true })
  expect(enabled.state.isBashEnabled()).toBe(true)
  enabled.dispose()

  const disabled = stateCreate({ fetch: async () => jsonResponse(catalogBody) })
  expect(disabled.state.isBashEnabled()).toBe(false)
  disabled.dispose()
})
