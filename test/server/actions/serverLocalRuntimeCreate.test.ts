import { expect, mock, spyOn, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createResult } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { appCreate } from "../../../src/app/appCreate.js"
import { runtimeConfigurationParse } from "../../../src/configuration/runtimeConfigurationParse.js"
import { databaseConnectionClose } from "../../../src/database/databaseConnectionClose.js"
import { databaseCreate } from "../../../src/database/databaseCreate.js"
import { databaseMigrate } from "../../../src/database/databaseMigrate.js"
import { organizationMemberTable } from "../../../src/identity/db/organizationMemberTable.js"
import { journalCursorCodecCreate } from "../../../src/journal/actions/journalCursorCodecCreate.js"
import { projectRegistryRepositoryUpsert } from "../../../src/project/db/projectRegistryRepositoryUpsert.js"
import { serverRuntimeCreate } from "../../../src/server/serverRuntimeCreate.js"
import type { ServerRuntimeOptions } from "../../../src/server/serverRuntimeOptions.js"
import { serverStart } from "../../../src/server/serverStart.js"
import { localRuntimeFixtureProvision } from "../fixtures/localRuntimeFixtureProvision.js"

function localRuntimeOptionsCreate(
  databaseUrl = "file:///tmp/opencode/unused-local-runtime.sqlite",
): ServerRuntimeOptions {
  const codec = journalCursorCodecCreate({ randomBytes, secret: "local-runtime-test-secret" })
  if (!codec.success) throw new Error(codec.errorMessage)
  return {
    local: {
      configuration: { databaseUrl, nodeEnv: "production" },
      identity: { userId: "local:fixture", organizationId: "local:organization" },
    },
    configurationStore: {} as never,
    journalCursorCodec: codec.data,
    projectRootDirs: [],
    providerAgentCatalog: { agents: [], providers: [], revision: `sha256-${"0".repeat(64)}` },
  }
}

test("local application.fetch uses a separately migrated database, persisted identity and unchanged project authorization without a listener", async () => {
  const directory = await mkdtemp("/tmp/opencode/codeline-local-runtime-")
  const root = join(directory, "projects")
  const projectPath = join(root, "fixture-project")
  const outsidePath = join(directory, "outside-project")
  const filePath = join(directory, "local data", "#%?.sqlite")
  const databaseUrl = pathToFileURL(filePath).href
  let runtime: Awaited<ReturnType<typeof serverRuntimeCreate>> | undefined
  const serve = spyOn(Bun, "serve").mockImplementation(() => {
    throw new Error("No listener allowed")
  })
  try {
    await mkdir(projectPath, { recursive: true })
    await mkdir(outsidePath)
    await writeFile(join(projectPath, "README.md"), "local runtime fixture\n")
    const migrated = await databaseMigrate(filePath, { projectRootDirs: [root] })
    expect(migrated).toEqual(createResult(undefined))
    const connection = databaseCreate({ databaseUrl, nodeEnv: "test" }, databaseUrl)
    if (!connection.success) throw new Error(connection.errorMessage)
    let otherProjectId = ""
    let outsideProjectId = ""
    try {
      const fixture = await localRuntimeFixtureProvision(connection.data.db)
      if (!fixture.success) throw new Error(fixture.errorMessage)
      const otherProject = await projectRegistryRepositoryUpsert(
        connection.data.db,
        fixture.data.otherIdentity.userId,
        projectPath,
      )
      if (!otherProject.success) throw new Error(otherProject.errorMessage)
      otherProjectId = otherProject.data.id
      const outsideProject = await projectRegistryRepositoryUpsert(
        connection.data.db,
        fixture.data.identity.userId,
        outsidePath,
      )
      if (!outsideProject.success) throw new Error(outsideProject.errorMessage)
      outsideProjectId = outsideProject.data.id
    } finally {
      expect(await databaseConnectionClose(connection.data)).toEqual(createResult(undefined))
    }

    const options = localRuntimeOptionsCreate(databaseUrl)
    options.projectRootDirs = [root]
    runtime = await serverRuntimeCreate(options)
    if (!runtime.success) throw new Error(runtime.errorMessage)
    const { application, dependencies } = runtime.data
    expect(dependencies.configuration).toMatchObject({
      databaseUrl,
      nodeEnv: "production",
      sessionsSidebarPageSize: 25,
    })
    expect(dependencies.configuration.authMode).toBeUndefined()
    expect(dependencies.configuration.developmentIdentity).toBeUndefined()
    expect(dependencies.configuration.oidcIssuer).toBeUndefined()
    expect(dependencies.fixtureApiToken).toBeUndefined()
    expect(dependencies.localIdentity).toEqual(options.local?.identity)
    const request = (path: string, init?: RequestInit) =>
      application.fetch(new Request(`http://local.invalid${path}`, init))
    for (const path of ["/health", "/ready", "/api/health", "/api/ready"])
      expect((await request(path)).status, path).toBe(200)
    for (const path of ["/api/auth/login", "/api/auth/providers", "/api/auth/callback", "/api/auth/session"])
      expect((await request(path)).status, path).toBe(404)

    const list = await request("/api/project/list", { headers: { "X-Codeline-User-Id": "local:other" } })
    expect(list.status).toBe(200)
    const listed = (await list.json()) as { projects: Array<{ id: string; available: boolean; label: string }> }
    const project = listed.projects.find((candidate) => candidate.label === "fixture-project")
    expect(project).toMatchObject({ available: true })
    expect(project?.id).not.toBe(otherProjectId)
    expect(listed.projects.find((candidate) => candidate.id === outsideProjectId)).toMatchObject({ available: false })
    expect(listed.projects.some((candidate) => candidate.id === otherProjectId)).toBe(false)
    const text = await request(`/api/project/text?project=${project?.id}&path=README.md`)
    expect(text.status).toBe(200)
    expect(await text.json()).toMatchObject({ content: "local runtime fixture\n" })
    for (const projectId of [otherProjectId, outsideProjectId])
      expect((await request(`/api/project/text?project=${projectId}&path=README.md`)).status).toBe(404)
    const registered = await request("/api/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: projectPath }),
    })
    expect(registered.status).toBe(200)
    const outside = await request("/api/project/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: outsidePath }),
    })
    expect(outside.status).toBe(400)

    // Revocation must affect future requests; composition does not cache authorization.
    await dependencies.database
      .delete(organizationMemberTable)
      .where(eq(organizationMemberTable.organizationId, "local:organization"))
    expect((await request("/api/project/list")).status).toBe(401)
    expect((await request("/api/ready")).status).toBe(200)
    expect(serve).not.toHaveBeenCalled()
  } finally {
    if (runtime?.success) expect(await runtime.data.shutdown()).toEqual(createResult(undefined))
    serve.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
})

test("local configuration and identity errors are rejected before application composition or database access", async () => {
  const base = localRuntimeOptionsCreate()
  const configuration = base.local!.configuration
  const identity = base.local!.identity
  const applicationCreate = mock(appCreate)
  const reconcile = mock(async () => createResult({ interruptedRunIds: [] }))
  const invalid: ServerRuntimeOptions[] = [
    { ...base, local: { configuration: { ...configuration, authMode: "development" } as never, identity } },
    { ...base, local: { configuration: { ...configuration, AUTH_MODE: "local" } as never, identity } },
    { ...base, local: { configuration: { ...configuration, oidcIssuer: "https://issuer.test" } as never, identity } },
    { ...base, local: { configuration: { ...configuration, databaseUrl: "file:./data/db.sqlite" }, identity } },
    { ...base, local: { configuration: { ...configuration, sessionsSidebarPageSize: 0 }, identity } },
    { ...base, local: { configuration, identity: { ...identity, userId: " " } } },
    { ...base, configuration: { databaseUrl: configuration.databaseUrl, nodeEnv: "test" } },
    { ...base, configurationStore: undefined },
    { ...base, journalCursorCodec: undefined },
    { ...base, projectRootDirs: undefined },
    { ...base, projectRootDirs: ["relative-root"] },
    { ...base, databasePath: "data/db.sqlite" },
    { ...base, databasePath: "/tmp/opencode/different-local-runtime.sqlite" },
  ]
  for (const options of invalid) {
    const result = await serverRuntimeCreate({
      ...options,
      appCreate: applicationCreate,
      runStartupInterruptionReconcile: reconcile,
    })
    expect(result.success).toBe(false)
  }
  expect(applicationCreate).not.toHaveBeenCalled()
  expect(reconcile).not.toHaveBeenCalled()
  expect(
    runtimeConfigurationParse({
      AUTH_MODE: "local",
      databaseUrl: configuration.databaseUrl,
      nodeEnv: "production",
      PUBLIC_ORIGIN: "https://preview.codeline.work",
    }).success,
  ).toBe(false)
})

test("local fixed-identity composition cannot be passed through the network serving wrapper even by untyped callers", async () => {
  const serve = mock(() => {
    throw new Error("must not serve")
  })
  await expect(serverStart({ ...localRuntimeOptionsCreate(), serve } as never)).rejects.toThrow(
    "Local runtime composition cannot open a network listener.",
  )
  expect(serve).not.toHaveBeenCalled()
})

test("local runtime leaves schema preparation to repository migrations and closes its connection if reconciliation fails", async () => {
  const directory = await mkdtemp("/tmp/opencode/codeline-local-unmigrated-")
  let closes = 0
  try {
    const result = await serverRuntimeCreate({
      ...localRuntimeOptionsCreate(pathToFileURL(join(directory, "db.sqlite")).href),
      databaseConnectionClose: async (connection) => {
        closes += 1
        return databaseConnectionClose(connection)
      },
    })
    expect(result.success).toBe(false)
    if (result.success) await result.data.shutdown()
    expect(closes).toBe(1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
