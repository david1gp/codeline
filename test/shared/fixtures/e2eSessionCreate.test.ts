import { expect, test } from "bun:test"
import type { BrowserContext } from "@playwright/test"
import { e2eRepositoryRoot } from "../../../e2e/e2eRepositoryRoot.js"
import { e2eSessionCreate } from "../../../e2e/e2eSessionCreate.js"

test("e2e session creation always targets the managed repository root", async () => {
  const previousLegacy = process.env.E2E_LEGACY_LOCAL
  const previousRunId = process.env.E2E_RUN_ID
  const previousTarget = process.env.E2E_TARGET
  const previousToken = process.env.E2E_FIXTURE_API_TOKEN
  process.env.E2E_LEGACY_LOCAL = "1"
  delete process.env.E2E_RUN_ID
  delete process.env.E2E_TARGET
  delete process.env.E2E_FIXTURE_API_TOKEN
  try {
    const received: Array<{ data: unknown; headers: unknown; url: string }> = []
    const context = {
      request: {
        post: async (url: string, options: { data: unknown; headers: unknown }) => {
          received.push({ data: options.data, headers: options.headers, url })
          if (url.endsWith("/api/project/registry/register"))
            return {
              json: async () => ({ project: { id: "managed-project-id" } }),
              ok: () => true,
              text: async () => "",
            }
          return undefined as never
        },
      },
    } as unknown as BrowserContext

    await e2eSessionCreate(context, "https://preview.codeline.work", {
      projectPath: "/tmp/not-the-managed-root",
      serverId: "example-server-local",
    })

    expect(received).toEqual([
      {
        data: { path: e2eRepositoryRoot },
        headers: { origin: "https://preview.codeline.work" },
        url: "https://preview.codeline.work/api/project/registry/register",
      },
      {
        data: { projectId: "managed-project-id", serverId: "example-server-local" },
        headers: { origin: "https://preview.codeline.work" },
        url: "https://preview.codeline.work/api/sessions",
      },
    ])
  } finally {
    if (previousLegacy === undefined) delete process.env.E2E_LEGACY_LOCAL
    else process.env.E2E_LEGACY_LOCAL = previousLegacy
    if (previousRunId === undefined) delete process.env.E2E_RUN_ID
    else process.env.E2E_RUN_ID = previousRunId
    if (previousTarget === undefined) delete process.env.E2E_TARGET
    else process.env.E2E_TARGET = previousTarget
    if (previousToken === undefined) delete process.env.E2E_FIXTURE_API_TOKEN
    else process.env.E2E_FIXTURE_API_TOKEN = previousToken
  }
})
