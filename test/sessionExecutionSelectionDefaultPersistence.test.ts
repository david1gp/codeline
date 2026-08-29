import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { ConfigurationStore } from "../src/configuration/configurationStore.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import type { ProviderCatalog } from "../src/providers/schema/providerCatalogSchema.js"
import { runExecutionSnapshotResolve } from "../src/run/actions/runExecutionSnapshotResolve.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionExecutionSelectionDefaultLoad } from "../src/session/actions/sessionExecutionSelectionDefaultLoad.js"
import { sessionExecutionSelectionDefaultUpsert } from "../src/session/actions/sessionExecutionSelectionDefaultUpsert.js"
import { sessionExecutionSelectionDefaultRepositoryDelete } from "../src/session/db/sessionExecutionSelectionDefaultRepositoryDelete.js"
import { sessionExecutionSelectionDefaultRepositoryLoad } from "../src/session/db/sessionExecutionSelectionDefaultRepositoryLoad.js"
import { sessionExecutionSelectionDefaultRepositoryUpsert } from "../src/session/db/sessionExecutionSelectionDefaultRepositoryUpsert.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import type { SessionExecutionSelection } from "../src/session/schema/sessionExecutionSelectionSchema.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-selection-default."))
const projectPath = path.join(rootPath, "project")
const noDefaultProjectPath = path.join(rootPath, "no-default")
await mkdir(projectPath)
await mkdir(noDefaultProjectPath)
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const userId = `selection-default-user-${uuidv7()}`
const otherUserId = `selection-default-other-user-${uuidv7()}`
const organizationId = `selection-default-organization-${uuidv7()}`
const serverId = `selection-default-server-${uuidv7()}`
const agentId = `selection-default-agent-${uuidv7()}`
const defaultSelection = {
  tools: {
    primary: { agentId, tools: { bash: false, webfetch: true } },
    selectableSubagents: [],
  },
  version: 1 as const,
} as unknown as SessionExecutionSelection

beforeAll(async () => {
  await database.insert(applicationUserTable).values([
    { displayName: "Selection Default User", id: userId },
    { displayName: "Selection Default Other User", id: otherUserId },
  ])
  await database.insert(organizationTable).values({
    id: organizationId,
    externalId: organizationId,
    name: "Selection Default Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://selection-default.test",
    id: serverId,
    name: "Selection Default Server",
    organizationId,
  })
  await database.insert(agentTable).values({
    configuration: { model: "agent-default-model", provider: "deterministic", tools: { bash: true } },
    id: agentId,
    name: "Selection Default Agent",
    role: "coding",
    serverId,
  })
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

test("default execution selection repositories are user/project scoped and revisioned", async () => {
  const first = await sessionExecutionSelectionDefaultRepositoryUpsert(database, userId, {
    executionSelection: defaultSelection,
    projectPath,
  })
  expect(first).toMatchObject({ success: true, data: { projectPath, revision: 1, userId } })
  if (!first.success) return

  const otherUser = await sessionExecutionSelectionDefaultRepositoryLoad(database, otherUserId, projectPath)
  expect(otherUser).toEqual({ success: true, data: undefined })
  const loaded = await sessionExecutionSelectionDefaultRepositoryLoad(database, userId, projectPath)
  expect(loaded).toMatchObject({ success: true, data: { executionSelection: defaultSelection, revision: 1 } })
  if (!loaded.success || loaded.data === undefined) return

  const second = await sessionExecutionSelectionDefaultRepositoryUpsert(database, userId, {
    executionSelection: {
      ...defaultSelection,
      tools: {
        ...defaultSelection.tools,
        primary: { ...defaultSelection.tools.primary, tools: { bash: true, webfetch: false } },
      },
    },
    projectPath,
  })
  expect(second).toMatchObject({ success: true, data: { revision: 2, createdAt: loaded.data.createdAt } })

  const deleted = await sessionExecutionSelectionDefaultRepositoryDelete(database, userId, projectPath)
  expect(deleted).toMatchObject({ success: true, data: { revision: 2, projectPath } })
  expect(await sessionExecutionSelectionDefaultRepositoryLoad(database, userId, projectPath)).toEqual({
    success: true,
    data: undefined,
  })
})

test("default execution selection actions canonicalize projects and reject paths outside configured roots", async () => {
  const saved = await sessionExecutionSelectionDefaultUpsert(
    database,
    userId,
    { executionSelection: defaultSelection, projectPath: path.join(projectPath, "..", "project") },
    { projectRootDirs: [rootPath] },
  )
  expect(saved).toMatchObject({ success: true, data: { projectPath } })
  expect(
    await sessionExecutionSelectionDefaultLoad(database, userId, path.join(os.tmpdir(), "outside"), {
      projectRootDirs: [rootPath],
    }),
  ).toMatchObject({ success: false, errorMessage: "The project path is invalid." })
  await sessionExecutionSelectionDefaultRepositoryDelete(database, userId, projectPath)
})

test("session creation resolves saved defaults before agent defaults and keeps inserted sessions immutable", async () => {
  const saved = await sessionExecutionSelectionDefaultUpsert(
    database,
    userId,
    { executionSelection: defaultSelection, projectPath },
    { projectRootDirs: [rootPath] },
  )
  expect(saved.success).toBe(true)

  const created = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `selection-default-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: agentId,
      projectPath,
      serverId,
      title: "Saved selection default",
    },
    { organizationId, projectRootDirs: [rootPath] },
  )
  expect(created).toMatchObject({ success: true, data: { session: { executionSelection: defaultSelection } } })
  if (!created.success) return

  await sessionExecutionSelectionDefaultUpsert(
    database,
    userId,
    {
      executionSelection: {
        ...defaultSelection,
        tools: {
          ...defaultSelection.tools,
          primary: { ...defaultSelection.tools.primary, tools: { bash: true, webfetch: true } },
        },
      },
      projectPath,
    },
    { projectRootDirs: [rootPath] },
  )
  const persisted = await database.select().from(sessionTable).where(eq(sessionTable.id, created.data.session.id))
  expect(persisted[0]?.executionSelection).toEqual(defaultSelection)
  await sessionExecutionSelectionDefaultRepositoryDelete(database, userId, projectPath)
})

test("session creation validates a saved selection against the current catalog before insertion", async () => {
  const staleSelection = {
    ...defaultSelection,
    tools: {
      ...defaultSelection.tools,
      selectableSubagents: [{ agentId: "removed-agent", tools: { bash: true, webfetch: false } }],
    },
  }
  await sessionExecutionSelectionDefaultRepositoryUpsert(database, userId, {
    executionSelection: staleSelection,
    projectPath: noDefaultProjectPath,
  })
  const catalog = {
    agents: [
      {
        enabled: true,
        id: agentId,
        mode: "primary",
        tools: { bash: false, webfetch: false },
      },
    ],
  } as unknown as ProviderCatalog
  const clientRequestId = `selection-default-invalid-${uuidv7()}`
  const created = await sessionCreate(
    database,
    userId,
    {
      clientRequestId,
      metadata: {},
      primaryAgentId: agentId,
      projectPath: noDefaultProjectPath,
      serverId,
      title: "Invalid saved selection",
    },
    { organizationId, projectRootDirs: [rootPath], providerAgentCatalog: catalog },
  )
  expect(created).toMatchObject({
    success: false,
    errorMessage: "The session execution selection references an unavailable subagent in the provider catalog.",
  })
  expect(await database.select().from(sessionTable).where(eq(sessionTable.clientRequestId, clientRequestId))).toEqual(
    [],
  )
  await sessionExecutionSelectionDefaultRepositoryDelete(database, userId, noDefaultProjectPath)
})

test("session creation resolves agent configuration defaults, then proves them in the run snapshot", async () => {
  const created = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `selection-default-agent-${uuidv7()}`,
      metadata: {},
      primaryAgentId: agentId,
      projectPath: noDefaultProjectPath,
      serverId,
      title: "Agent selection default",
    },
    { organizationId, projectRootDirs: [rootPath] },
  )
  expect(created).toMatchObject({
    success: true,
    data: {
      session: {
        executionSelection: {
          tools: {
            primary: { agentId, tools: { bash: true, webfetch: false } },
            selectableSubagents: [],
          },
          version: 1,
        },
      },
    },
  })
  if (!created.success) return
  const capturedSelection = created.data.session.executionSelection
  expect(capturedSelection).not.toBeNull()
  if (capturedSelection === null) return

  await database
    .update(agentTable)
    .set({ configuration: { model: "changed-model", provider: "deterministic", tools: { webfetch: true } } })
    .where(eq(agentTable.id, agentId))
  const persisted = await database.select().from(sessionTable).where(eq(sessionTable.id, created.data.session.id))
  expect(persisted[0]?.executionSelection).toEqual(capturedSelection)

  const store = {
    gitStore: {} as never,
    snapshot: {
      configuration: {
        agentConfigurations: [
          {
            configuration: { model: "snapshot-model", provider: "deterministic", tools: { webfetch: true } },
            target: { agentId, serverId },
          },
        ],
        version: 1,
      },
      revision: "selection-default-revision",
    },
  } satisfies ConfigurationStore
  const snapshot = runExecutionSnapshotResolve({ agentId, serverId }, store, { executionSelection: capturedSelection })
  expect(snapshot).toMatchObject({
    success: true,
    data: {
      configuration: { tools: { bash: true, webfetch: false } },
      executionManifest: {
        tools: { primary: { agentId, tools: ["bash", "skill", "delegate_task"] } },
      },
    },
  })
})
