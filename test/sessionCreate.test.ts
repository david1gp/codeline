import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { apiIdempotencyRequestHashCreate } from "../src/api/idempotency/apiIdempotencyRequestHashCreate.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionDelete } from "../src/session/actions/sessionDelete.js"
import { sessionLoad } from "../src/session/actions/sessionLoad.js"
import { sessionPin } from "../src/session/actions/sessionPin.js"
import { sessionRename } from "../src/session/actions/sessionRename.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `session-test-agent-${uuidv7()}`,
  serverId: `session-test-server-${uuidv7()}`,
  userKey: `session-test-user-${uuidv7()}`,
}
let userId: string | undefined

beforeAll(async () => {
  if (!databaseAvailable) return

  const user = await developmentIdentityUpsert(database, {
    displayName: "Session Test User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(organizationTable).values({ id: userId, externalId: userId, name: "Session Test Organization" })

  await database.insert(serverTable).values({
    endpoint: "http://session-test-server.test",
    id: fixture.serverId,
    name: "Session Test Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Session Test Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)("session actions create idempotently and enforce ownership", async () => {
  if (userId === undefined) return
  const clientRequestId = `session-test-request-${uuidv7()}`
  const input = {
    clientRequestId,
    metadata: { project: "codeline" },
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Initial title",
  }

  const created = await sessionCreate(database, userId, input, { organizationId: userId })
  expect(created).toMatchObject({
    success: true,
    data: { created: true, session: { pinned: true, projectPath: "~", title: "Initial title" } },
  })
  if (!created.success) return

  const repeated = await sessionCreate(
    database,
    userId,
    { ...input, title: "Changed title" },
    { organizationId: userId },
  )
  expect(repeated).toMatchObject({ success: true, data: { created: false, session: { id: created.data.session.id } } })

  const loaded = await sessionLoad(database, userId, userId, created.data.session.id)
  expect(loaded).toMatchObject({
    success: true,
    data: {
      agent: { id: fixture.agentId },
      server: { id: fixture.serverId },
      session: { id: created.data.session.id },
    },
  })
  const hidden = await sessionLoad(database, "development:unknown-session-user", userId, created.data.session.id)
  expect(hidden).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const renamed = await sessionRename(database, userId, created.data.session.id, "Renamed title")
  expect(renamed).toMatchObject({ success: true, data: { title: "Renamed title" } })
  const unauthorizedRename = await sessionRename(
    database,
    "development:unknown-session-user",
    created.data.session.id,
    "Unauthorized title",
  )
  expect(unauthorizedRename).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const unpinned = await sessionPin(database, userId, created.data.session.id, false)
  expect(unpinned).toMatchObject({ success: true, data: { pinned: false } })
  const unauthorizedPin = await sessionPin(database, "development:unknown-session-user", created.data.session.id, true)
  expect(unauthorizedPin).toMatchObject({ success: false, errorMessage: "The session could not be found." })
  const pinned = await sessionPin(database, userId, created.data.session.id, true)
  expect(pinned).toMatchObject({ success: true, data: { pinned: true } })

  const archived = await sessionArchive(database, userId, created.data.session.id)
  expect(archived).toMatchObject({ success: true, data: { archivedAt: expect.any(Date) } })
  const renamedArchived = await sessionRename(database, userId, created.data.session.id, "Archived title")
  expect(renamedArchived).toMatchObject({ success: false, errorMessage: "The session is archived." })
  const pinnedArchived = await sessionPin(database, userId, created.data.session.id, false)
  expect(pinnedArchived).toMatchObject({ success: false, errorMessage: "The session is archived." })
  const deleted = await sessionDelete(database, userId, created.data.session.id)
  expect(deleted).toMatchObject({ success: true, data: { id: created.data.session.id } })
})

test.skipIf(!databaseAvailable)("session creation binds retries to the original payload", async () => {
  if (userId === undefined) return
  const clientRequestId = `session-test-payload-${uuidv7()}`
  const input = {
    clientRequestId,
    metadata: { payload: "original" },
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Original payload",
  }
  const requestHash = apiIdempotencyRequestHashCreate(input)
  const created = await sessionCreate(database, userId, input, {
    idempotencyKey: clientRequestId,
    organizationId: userId,
    requestHash,
  })
  expect(created).toMatchObject({ success: true, data: { created: true, replayed: false } })

  const changed = await sessionCreate(
    database,
    userId,
    { ...input, title: "Changed payload" },
    {
      idempotencyKey: clientRequestId,
      organizationId: userId,
      requestHash: apiIdempotencyRequestHashCreate({ ...input, title: "Changed payload" }),
    },
  )
  expect(changed).toMatchObject({ code: "idempotency_conflict", success: false })

  const replayed = await sessionCreate(database, userId, input, {
    idempotencyKey: clientRequestId,
    organizationId: userId,
    requestHash,
  })
  expect(replayed).toMatchObject({ success: true, data: { created: false, replayed: true } })
  if (replayed.success) await sessionDelete(database, userId, replayed.data.session.id)
})

test.skipIf(!databaseAvailable)("session creation persists a canonical execution selection", async () => {
  if (userId === undefined) return
  const input = {
    clientRequestId: `session-test-selection-${uuidv7()}`,
    executionSelection: {
      tools: {
        primary: { agentId: fixture.agentId, tools: { bash: true } },
        selectableSubagents: [{ agentId: "session-test-reviewer", tools: { webfetch: true } }],
      },
      version: 1 as const,
    },
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Execution selection session",
  }
  const requestHash = apiIdempotencyRequestHashCreate(input)
  const created = await sessionCreate(database, userId, input, {
    idempotencyKey: input.clientRequestId,
    organizationId: userId,
    requestHash,
  })
  expect(created).toMatchObject({
    success: true,
    data: {
      created: true,
      session: {
        executionSelection: {
          tools: {
            primary: { agentId: fixture.agentId, tools: { bash: true, webfetch: false } },
            selectableSubagents: [{ agentId: "session-test-reviewer", tools: { bash: false, webfetch: true } }],
          },
          version: 1,
        },
      },
    },
  })
  if (!created.success) return

  const [persisted] = await database.select().from(sessionTable).where(eq(sessionTable.id, created.data.session.id))
  expect(persisted?.executionSelection).toEqual(created.data.session.executionSelection)

  const changedSelection = {
    ...input,
    executionSelection: {
      ...input.executionSelection,
      tools: {
        ...input.executionSelection.tools,
        primary: { ...input.executionSelection.tools.primary, tools: { bash: false, webfetch: true } },
      },
    },
  }
  expect(
    await sessionCreate(database, userId, changedSelection, {
      idempotencyKey: input.clientRequestId,
      organizationId: userId,
      requestHash: apiIdempotencyRequestHashCreate(changedSelection),
    }),
  ).toMatchObject({ code: "idempotency_conflict", success: false })

  await sessionDelete(database, userId, created.data.session.id)
})

test.skipIf(!databaseAvailable)("session creation snapshots instructions before persisting the session", async () => {
  if (userId === undefined) return
  const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-session-instructions-projects-"))
  const projectRoot = path.join(projectsRoot, "instruction-project")
  const globalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-session-instructions-global-"))
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true })
  await fs.writeFile(path.join(globalRoot, "AGENTS.md"), "session global instructions", "utf8")
  await fs.writeFile(path.join(projectRoot, "AGENTS.md"), "session root instructions", "utf8")
  await fs.writeFile(path.join(projectRoot, "src", "AGENTS.md"), "session src instructions", "utf8")

  try {
    const input = {
      clientRequestId: `session-test-instructions-${uuidv7()}`,
      metadata: { instructions: "snapshot" },
      primaryAgentId: fixture.agentId,
      projectPath: projectRoot,
      serverId: fixture.serverId,
      title: "Instruction snapshot session",
    }
    const created = await sessionCreate(database, userId, input, {
      globalAgentsPath: path.join(globalRoot, "AGENTS.md"),
      organizationId: userId,
      projectRootDirs: [projectsRoot],
    })
    expect(created).toMatchObject({ success: true, data: { created: true } })
    if (!created.success) return

    expect(
      created.data.session.instructionSnapshot.snapshots.map(({ canonicalPath, source, scope, content }) => ({
        canonicalPath,
        content,
        scope,
        source,
      })),
    ).toEqual([
      {
        canonicalPath: path.join(globalRoot, "AGENTS.md"),
        content: "session global instructions",
        scope: "global",
        source: "global",
      },
      {
        canonicalPath: path.join(projectRoot, "AGENTS.md"),
        content: "session root instructions",
        scope: ".",
        source: "project",
      },
    ])
    expect(created.data.session.instructionSnapshot.snapshots.some(({ scope }) => scope === "src")).toBe(false)
    const [persisted] = await database.select().from(sessionTable).where(eq(sessionTable.id, created.data.session.id))
    expect(persisted?.instructionSnapshot).toEqual(created.data.session.instructionSnapshot)

    const loaded = await sessionLoad(database, userId, userId, created.data.session.id)
    expect(loaded).toMatchObject({
      success: true,
      data: { session: { id: created.data.session.id, instructionSnapshot: created.data.session.instructionSnapshot } },
    })
    if (loaded.success) expect(Object.isFrozen(loaded.data.session.instructionSnapshot)).toBe(true)

    await fs.writeFile(path.join(projectRoot, "AGENTS.md"), "changed after session creation", "utf8")
    await fs.rm(path.join(projectRoot, "src", "AGENTS.md"))
    const unchanged = await sessionLoad(database, userId, userId, created.data.session.id)
    expect(unchanged).toMatchObject({ success: true })
    if (unchanged.success)
      expect(unchanged.data.session.instructionSnapshot).toEqual(created.data.session.instructionSnapshot)
    await sessionDelete(database, userId, created.data.session.id)
  } finally {
    await Promise.all([
      fs.rm(projectsRoot, { force: true, recursive: true }),
      fs.rm(globalRoot, { force: true, recursive: true }),
    ])
  }
})

test.skipIf(!databaseAvailable)(
  "session creation persists effective prompt and instruction overrides idempotently",
  async () => {
    if (userId === undefined) return
    const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-session-effective-context-projects-"))
    const projectRoot = path.join(projectsRoot, "effective-context-project")
    await fs.mkdir(projectRoot, { recursive: true })
    const instructionPath = path.join(projectRoot, "AGENTS.md")
    await fs.writeFile(instructionPath, "server instructions", "utf8")

    try {
      const input = {
        agentPrompt: "Use the session prompt.",
        clientRequestId: `session-test-effective-context-${uuidv7()}`,
        instructionOverrides: { [instructionPath]: "edited café instructions" },
        metadata: { context: "effective" },
        primaryAgentId: fixture.agentId,
        projectPath: projectRoot,
        serverId: fixture.serverId,
        title: "Effective context session",
      }
      const requestHash = apiIdempotencyRequestHashCreate(input)
      const created = await sessionCreate(database, userId, input, {
        idempotencyKey: input.clientRequestId,
        organizationId: userId,
        projectRootDirs: [projectsRoot],
        requestHash,
      })
      expect(created).toMatchObject({
        success: true,
        data: { created: true, session: { agentPrompt: input.agentPrompt } },
      })
      if (!created.success) return

      const effectiveEntry = created.data.session.instructionSnapshot.snapshots.find(
        ({ canonicalPath }) => canonicalPath === instructionPath,
      )
      expect(effectiveEntry).toMatchObject({
        canonicalPath: instructionPath,
        content: "edited café instructions",
        source: "project",
      })
      if (effectiveEntry === undefined) return
      expect(effectiveEntry.size).toBe(Buffer.byteLength(effectiveEntry.content, "utf8"))
      expect(created.data.session.executionManifest?.instructions.snapshots).toEqual(
        created.data.session.instructionSnapshot.snapshots,
      )

      const [persisted] = await database.select().from(sessionTable).where(eq(sessionTable.id, created.data.session.id))
      expect(persisted?.agentPrompt).toBe(input.agentPrompt)
      expect(persisted?.instructionSnapshot).toEqual(created.data.session.instructionSnapshot)
      expect(persisted?.executionManifest?.instructions).toEqual(created.data.session.instructionSnapshot)

      const changedInstructions = await sessionCreate(
        database,
        userId,
        { ...input, instructionOverrides: { [instructionPath]: "a different edit" } },
        {
          idempotencyKey: input.clientRequestId,
          organizationId: userId,
          projectRootDirs: [projectsRoot],
          requestHash: apiIdempotencyRequestHashCreate({
            ...input,
            instructionOverrides: { [instructionPath]: "a different edit" },
          }),
        },
      )
      expect(changedInstructions).toMatchObject({ code: "idempotency_conflict", success: false })

      const changed = await sessionCreate(
        database,
        userId,
        { ...input, agentPrompt: "A different session prompt." },
        {
          idempotencyKey: input.clientRequestId,
          organizationId: userId,
          projectRootDirs: [projectsRoot],
          requestHash: apiIdempotencyRequestHashCreate({ ...input, agentPrompt: "A different session prompt." }),
        },
      )
      expect(changed).toMatchObject({ code: "idempotency_conflict", success: false })

      const replayed = await sessionCreate(database, userId, input, {
        idempotencyKey: input.clientRequestId,
        organizationId: userId,
        projectRootDirs: [projectsRoot],
        requestHash,
      })
      expect(replayed).toMatchObject({ success: true, data: { replayed: true } })
      if (replayed.success) {
        expect(replayed.data.session.agentPrompt).toBe(input.agentPrompt)
        expect(replayed.data.session.instructionSnapshot).toEqual(created.data.session.instructionSnapshot)
        await sessionDelete(database, userId, replayed.data.session.id)
      }
    } finally {
      await fs.rm(projectsRoot, { force: true, recursive: true })
    }
  },
)

test.skipIf(!databaseAvailable)("session creation distinguishes an empty prompt from an omitted prompt", async () => {
  if (userId === undefined) return

  const empty = await sessionCreate(
    database,
    userId,
    {
      agentPrompt: "",
      clientRequestId: `session-test-empty-prompt-${uuidv7()}`,
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Empty session prompt",
    },
    { organizationId: userId },
  )
  const omitted = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `session-test-omitted-prompt-${uuidv7()}`,
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Omitted session prompt",
    },
    { organizationId: userId },
  )

  expect(empty).toMatchObject({ success: true, data: { session: { agentPrompt: "" } } })
  expect(omitted).toMatchObject({ success: true, data: { session: { agentPrompt: null } } })
  if (empty.success) await sessionDelete(database, userId, empty.data.session.id)
  if (omitted.success) await sessionDelete(database, userId, omitted.data.session.id)
})
