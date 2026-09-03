import { expect, test } from "bun:test"
import type { BrowserContext } from "@playwright/test"
import { e2eRepositoryRoot } from "../e2e/e2eRepositoryRoot.js"
import { e2eSessionCreate } from "../e2e/e2eSessionCreate.js"

test("e2e session creation always targets the managed repository root", async () => {
  const received: Array<{ data: unknown; headers: unknown; url: string }> = []
  const context = {
    request: {
      post: async (url: string, options: { data: unknown; headers: unknown }) => {
        received.push({ data: options.data, headers: options.headers, url })
        if (url.endsWith("/api/project/registry/register"))
          return { json: async () => ({ project: { id: "managed-project-id" } }), ok: () => true, text: async () => "" }
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
})
