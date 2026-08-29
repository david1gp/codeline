import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { projectRegistryImportActionsStateCreate } = await import(
  "../src/project/ui/projectRegistryImportActionsStateCreate.js"
)
const { projectRegistryStateCreate } = await import("../src/project/ui/projectRegistryStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("projectRegistryImportActionsStateCreate starts in idle state", () => {
  const root = createRoot((dispose) => {
    const state = projectRegistryImportActionsStateCreate()
    return { dispose, state }
  })

  expect(root.state.status()).toBe("idle")
  expect(root.state.isImporting()).toBe(false)
  expect(root.state.buttonDisabled()).toBe(false)
  expect(root.state.buttonLabel()).toBe("Import OpenCode projects")
  expect(root.state.importedCount()).toBeNull()
  expect(root.state.errorMessage()).toBeNull()
  expect(root.state.feedbackMessage()).toBeNull()
  root.dispose()
})

test("projectRegistryImportActionsStateCreate imports projects and provides count-only success feedback", async () => {
  const requests: Array<{ method?: string; url: string }> = []
  let importedCountCallback: number | undefined
  let refreshCount = 0

  const root = createRoot((dispose) => {
    const registry = projectRegistryStateCreate({
      accountId: () => "user-1",
      fetch: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        requests.push({ method, url })

        if (url === "/api/project/registry/import" && method === "POST") {
          return Response.json({ importedCount: 2 })
        }

        refreshCount += 1
        return Response.json({
          projects: [
            { available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fd0", label: "Imported Alpha" },
            { available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fd1", label: "Imported Beta" },
          ],
          truncated: false,
        })
      },
    })

    const state = projectRegistryImportActionsStateCreate({
      onImported: (count) => {
        importedCountCallback = count
      },
      projectRegistry: () => registry,
    })

    return { dispose, registry, state }
  })

  await tick()
  expect(root.state.status()).toBe("idle")

  const success = await root.state.projectImport()
  expect(success).toBe(true)
  expect(root.state.status()).toBe("success")
  expect(root.state.importedCount()).toBe(2)
  expect(root.state.feedbackMessage()).toBe("Imported 2 projects.")
  expect(importedCountCallback).toBe(2)
  expect(requests).toContainEqual({ method: "POST", url: "/api/project/registry/import" })

  await tick()
  expect(root.registry.projects()).toHaveLength(2)
  root.dispose()
})

test("projectRegistryImportActionsStateCreate formats singular count correctly", async () => {
  const root = createRoot((dispose) => {
    const state = projectRegistryImportActionsStateCreate({
      fetch: async () => Response.json({ importedCount: 1 }),
    })
    return { dispose, state }
  })

  const success = await root.state.projectImport()
  expect(success).toBe(true)
  expect(root.state.status()).toBe("success")
  expect(root.state.importedCount()).toBe(1)
  expect(root.state.feedbackMessage()).toBe("Imported 1 project.")
  root.dispose()
})

test("projectRegistryImportActionsStateCreate handles failure feedback on 401 unauthorized", async () => {
  const root = createRoot((dispose) => {
    const state = projectRegistryImportActionsStateCreate({
      fetch: async () =>
        Response.json({ error: { code: "unauthorized", message: "Authentication is required." } }, { status: 401 }),
    })
    return { dispose, state }
  })

  const success = await root.state.projectImport()
  expect(success).toBe(false)
  expect(root.state.status()).toBe("error")
  expect(root.state.errorMessage()).toBe("Authentication is required.")
  expect(root.state.feedbackMessage()).toBe("Authentication is required.")
  expect(root.state.isImporting()).toBe(false)
  expect(root.state.buttonDisabled()).toBe(false)
  root.dispose()
})

test("projectRegistryImportActionsStateCreate handles server error feedback", async () => {
  const root = createRoot((dispose) => {
    const state = projectRegistryImportActionsStateCreate({
      fetch: async () =>
        Response.json(
          { error: { code: "internal_server_error", message: "OpenCode database could not be read." } },
          { status: 500 },
        ),
    })
    return { dispose, state }
  })

  const success = await root.state.projectImport()
  expect(success).toBe(false)
  expect(root.state.status()).toBe("error")
  expect(root.state.feedbackMessage()).toBe("OpenCode database could not be read.")
  root.dispose()
})

test("projectRegistryImportActionsStateCreate prevents duplicate in-flight imports", async () => {
  let callCount = 0
  let resolvePromise: (res: Response) => void = () => undefined

  const root = createRoot((dispose) => {
    const state = projectRegistryImportActionsStateCreate({
      fetch: async () => {
        callCount += 1
        return new Promise<Response>((resolve) => {
          resolvePromise = resolve
        })
      },
    })
    return { dispose, state }
  })

  const firstCallPromise = root.state.projectImport()
  expect(root.state.isImporting()).toBe(true)
  expect(root.state.buttonDisabled()).toBe(true)
  expect(root.state.buttonLabel()).toBe("Importing…")

  const secondCallResult = await root.state.projectImport()
  expect(secondCallResult).toBe(false)
  expect(callCount).toBe(1)

  resolvePromise(Response.json({ importedCount: 0 }))
  await firstCallPromise

  expect(root.state.status()).toBe("success")
  expect(root.state.feedbackMessage()).toBe("Imported 0 projects.")
  root.dispose()
})
