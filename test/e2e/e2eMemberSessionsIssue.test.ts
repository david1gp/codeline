import { afterAll, beforeAll, expect, test } from "bun:test"
import type { BrowserContext } from "@playwright/test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { e2eCheckpointStoreCreate } from "../../e2e/e2eCheckpointStoreCreate.js"
import { e2eCommandProjectIssue } from "../../e2e/e2eCommandProjectIssue.js"
import { e2eMemberSessionsExpire } from "../../e2e/e2eMemberSessionsExpire.js"
import { e2eMemberSessionsIssue } from "../../e2e/e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "../../e2e/e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "../../e2e/e2eRunIdCreate.js"
import { e2eSessionCreate } from "../../e2e/e2eSessionCreate.js"

const origin = "https://preview.codeline.work"
const savedEnvironment = { ...process.env }
const originalFetch = globalThis.fetch
let directory: string
let requests: Array<{ url: string; init: RequestInit }>
let response: (url: string, init: RequestInit) => Promise<Response>
const member = (index: number) => ({
  displayName: `E2E Member ${index}`,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  token: `token${index}`,
  userId: `user${index}`,
})

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "e2e-fixture-helper-"))
  Object.assign(process.env, {
    NODE_ENV: "test",
    E2E_FIXTURE_CHECKPOINT_DIRECTORY: directory,
    E2E_RUN_ID: "e2eparent123",
    E2E_TARGET: "production",
    E2E_FIXTURE_API_TOKEN: "x".repeat(40),
    PUBLIC_ORIGIN: origin,
    OIDC_ORGANIZATION_ID: "fixture-org",
  })
  await e2eCheckpointStoreCreate(directory).save({
    version: 2,
    target: "production",
    origin,
    runId: "e2eparent123",
    createdAt: new Date().toISOString(),
    suiteManifest: [],
    completedSuites: [],
    resourceIds: { fixtureRunIds: [] },
  })
  globalThis.fetch = Object.assign(
    async (url: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} })
      return response(String(url), init ?? {})
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
})

afterAll(async () => {
  globalThis.fetch = originalFetch
  for (const key of new Set([...Object.keys(process.env), ...Object.keys(savedEnvironment)])) {
    if (savedEnvironment[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnvironment[key]
  }
  if (directory) await rm(directory, { recursive: true, force: true })
})

test("each test ID is E2E-marked, unique, and accepted by the fixture API", () => {
  const ids = new Set(Array.from({ length: 100 }, () => e2eRunIdCreate()))
  expect(ids.size).toBe(100)
  for (const id of ids) expect(id).toMatch(/^e2e[0-9a-z]{3,37}$/)
})

test("issuance registers the ID atomically before HTTP and adapts the two-member response", async () => {
  requests = []
  const runId = e2eRunIdCreate()
  response = async (_url, init) => {
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ runId })
    expect((await e2eCheckpointStoreCreate(directory).load("production"))?.resourceIds.fixtureRunIds).toContain(runId)
    return Response.json(
      {
        exists: true,
        organizationId: "org",
        subjectPrefix: `e2e-organization-member-${runId}-`,
        members: [member(1), member(2)],
      },
      { status: 201 },
    )
  }
  const issued = await e2eMemberSessionsIssue(runId)
  expect(issued.organizationExternalId).toBe("fixture-org")
  expect(issued.members.map((item) => item.token)).toEqual(["token1", "token2"])
  expect(requests[0]?.init.redirect).toBe("error")
  expect(requests[0]?.init.cache).toBe("no-store")
  expect(requests[0]?.init.headers).toEqual({
    Authorization: `Bearer ${"x".repeat(40)}`,
    "Content-Type": "application/json",
  })
  response = async (_url, init) => {
    if (init.method === "POST")
      return Response.json({
        exists: true,
        expiredSessions: [{ expiresAt: new Date(0).toISOString(), sessionId: "session1" }],
      })
    return Response.json({ exists: true, userIds: ["user1", "user2"] })
  }
  expect(await e2eMemberSessionsExpire(runId, "user1")).toEqual([
    { expiresAt: new Date(0).toISOString(), sessionId: "session1" },
  ])
  expect(JSON.parse(requests.at(-1)!.init.body as string)).toEqual({ userId: "user1" })
  expect(await e2eMemberSessionsPurge(runId)).toEqual(["user1", "user2"])
  expect(requests.some((item) => item.init.method === "DELETE")).toBe(false)
})

test("a lost issue response keeps the ID for suite cleanup and never reissues it", async () => {
  requests = []
  const runId = e2eRunIdCreate()
  response = async () => {
    throw new Error("response lost")
  }
  await expect(e2eMemberSessionsIssue(runId)).rejects.toThrow("response lost")
  expect((await e2eCheckpointStoreCreate(directory).load("production"))?.resourceIds.fixtureRunIds).toContain(runId)
  await expect(e2eMemberSessionsIssue(runId)).rejects.toThrow("already registered")
  expect(requests).toHaveLength(1)
})

test("command project issuance requires a checkpoint-registered member run and sends no payload", async () => {
  requests = []
  const runId = e2eRunIdCreate()
  await expect(e2eCommandProjectIssue(runId)).rejects.toThrow("Unregistered")
  expect(requests).toHaveLength(0)
  response = async (_url, init) => {
    if (init.method === "POST" && init.body !== undefined)
      return Response.json({
        exists: true,
        organizationId: "org",
        subjectPrefix: `e2e-${runId}`,
        members: [member(1), member(2)],
      })
    expect(init.method).toBe("POST")
    expect(init.body).toBeUndefined()
    expect(init.headers).toEqual({ Authorization: `Bearer ${"x".repeat(40)}` })
    expect((await e2eCheckpointStoreCreate(directory).load("production"))?.resourceIds.fixtureRunIds).toContain(runId)
    return Response.json({ exists: true, path: `/server/projects/.e2e-command-${runId}` }, { status: 201 })
  }
  await e2eMemberSessionsIssue(runId)
  expect(await e2eCommandProjectIssue(runId)).toBe(`/server/projects/.e2e-command-${runId}`)
  expect(requests.at(-1)?.url).toBe(`${origin}/api/_e2e/fixtures/runs/${runId}/command-project`)
})

test("sessions select an available server-owned project without issuing command data", async () => {
  const calls: Array<{ url: string; body?: unknown }> = []
  const api = {
    get: async (url: string) => {
      calls.push({ url })
      return {
        ok: () => true,
        text: async () => "",
        json: async () => ({ projects: [{ id: "server-project", available: true }] }),
      }
    },
    post: async (url: string, options: { data: unknown }) => {
      calls.push({ url, body: options.data })
      return { ok: () => true, text: async () => "", json: async () => ({ session: { id: "session" } }) }
    },
  }
  const context = { request: api } as unknown as BrowserContext
  await e2eSessionCreate(context, origin, { title: "test", projectId: "untrusted", projectPath: "/runner" })
  expect(calls).toEqual([
    { url: `${origin}/api/project/registry/list` },
    { url: `${origin}/api/sessions`, body: { title: "test", projectId: "server-project" } },
  ])
})

test("a configured dev checkpoint uses its own HTTPS origin without using the local script", async () => {
  const devOrigin = "https://dev.example.test"
  const runId = e2eRunIdCreate()
  requests = []
  await e2eCheckpointStoreCreate(directory).save({
    version: 2,
    target: "dev",
    origin: devOrigin,
    runId: "e2eparentdev123",
    createdAt: new Date().toISOString(),
    suiteManifest: [],
    completedSuites: [],
    resourceIds: { fixtureRunIds: [] },
  })
  process.env.E2E_RUN_ID = "e2eparentdev123"
  process.env.E2E_TARGET = "dev"
  process.env.E2E_DEV_ORIGIN = devOrigin
  process.env.PUBLIC_ORIGIN = devOrigin
  try {
    response = async () =>
      Response.json(
        {
          exists: true,
          organizationId: "org",
          subjectPrefix: `e2e-organization-member-${runId}-`,
          members: [member(1), member(2)],
        },
        { status: 201 },
      )
    expect((await e2eMemberSessionsIssue(runId)).members).toHaveLength(2)
    expect(requests[0]?.url).toBe(`${devOrigin}/api/_e2e/fixtures/runs`)
    expect((await e2eCheckpointStoreCreate(directory).load("dev"))?.resourceIds.fixtureRunIds).toContain(runId)
  } finally {
    process.env.E2E_RUN_ID = "e2eparent123"
    process.env.E2E_TARGET = "production"
    delete process.env.E2E_DEV_ORIGIN
    process.env.PUBLIC_ORIGIN = origin
  }
})

test("an incomplete runner environment never falls back to local scripts or transmits the bearer", async () => {
  requests = []
  delete process.env.E2E_TARGET
  await expect(e2eMemberSessionsIssue(e2eRunIdCreate())).rejects.toThrow("E2E_RUN_ID, E2E_TARGET")
  expect(requests).toHaveLength(0)
  process.env.E2E_TARGET = "production"
  process.env.PUBLIC_ORIGIN = "https://other.example.test"
  await expect(e2eMemberSessionsIssue(e2eRunIdCreate())).rejects.toThrow("origin mismatch")
  expect(requests).toHaveLength(0)
  process.env.PUBLIC_ORIGIN = origin
})
