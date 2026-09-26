import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { eq } from "drizzle-orm"
import { createResult } from "@adaptive-ds/result"
import type { ConfigurationStore } from "../../../src/configuration/configurationStore.js"
import { globalAgentPresetDocumentDefaults } from "../../../src/configuration/globalAgentPresetDocumentDefaults.js"
import type { ProviderCatalog } from "../../../src/providers/schema/providerCatalogSchema.js"
import { providerAgentCatalogLoad } from "../../../src/providers/catalog/providerAgentCatalogLoad.js"
import { runExecutionSnapshotResolve } from "../../../src/run/actions/runExecutionSnapshotResolve.js"
import { agentTable } from "../../../src/agents/db/agentTable.js"
import { apiIdempotencyRequestHashCreate } from "../../../src/api/idempotency/apiIdempotencyRequestHashCreate.js"
import { databaseConnectionClose } from "../../../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../../../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../../../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../../../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../../../src/identity/db/organizationTable.js"
import { serverTable } from "../../../src/servers/db/serverTable.js"
import { sessionArchive } from "../../../src/session/actions/sessionArchive.js"
import { sessionCreate } from "../../../src/session/actions/sessionCreate.js"
import { sessionDelete } from "../../../src/session/actions/sessionDelete.js"
import { sessionLoad } from "../../../src/session/actions/sessionLoad.js"
import { sessionPin } from "../../../src/session/actions/sessionPin.js"
import { sessionRename } from "../../../src/session/actions/sessionRename.js"
import { sessionTable } from "../../../src/session/db/sessionTable.js"
import { uuidv7 } from "../../../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "../../database/fixtures/databaseTestConnectionCreate.js"

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
    configuration: { model: "session-test-deterministic", provider: "deterministic" },
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
  expect(created.data.session.metadata.sessionModelDefault).toBeUndefined()

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

test.skipIf(!databaseAvailable)(
  "global presets capture selected resources with project precedence and immutable command availability",
  async () => {
    if (userId === undefined) return
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-global-preset-"))
    const project = path.join(root, "project")
    const globalSkillsPath = path.join(root, "global-skills")
    const globalCommandsPath = path.join(root, "global-commands")
    const projectSkillsPath = path.join(project, ".agents", "skills")
    const projectCommandsPath = path.join(project, ".agents", "commands")
    await Promise.all([
      fs.mkdir(path.join(globalSkillsPath, "shared"), { recursive: true }),
      fs.mkdir(path.join(projectSkillsPath, "shared"), { recursive: true }),
      fs.mkdir(path.join(projectSkillsPath, "local"), { recursive: true }),
      fs.mkdir(globalCommandsPath, { recursive: true }),
      fs.mkdir(projectCommandsPath, { recursive: true }),
    ])
    const skill = (name: string, body: string) => `---\nname: ${name}\ndescription: ${body}\n---\n${body}\n`
    const command = (body: string) => `---\ndescription: ${body}\n---\n${body}\n`
    await Promise.all([
      fs.writeFile(path.join(globalSkillsPath, "shared", "SKILL.md"), skill("shared", "global")),
      fs.writeFile(path.join(projectSkillsPath, "shared", "SKILL.md"), skill("shared", "project")),
      fs.writeFile(path.join(projectSkillsPath, "local", "SKILL.md"), skill("local", "local")),
      fs.writeFile(path.join(globalCommandsPath, "allowed.md"), command("global allowed")),
      fs.writeFile(path.join(globalCommandsPath, "blocked.md"), command("global blocked")),
      fs.writeFile(path.join(globalCommandsPath, "excluded.md"), command("global excluded")),
      fs.writeFile(path.join(projectCommandsPath, "blocked.md"), command("project blocked")),
      fs.writeFile(path.join(projectCommandsPath, "local.md"), command("project local")),
    ])
    const document = globalAgentPresetDocumentDefaults()
    document.categories.skills.sets.push({
      id: "chosen-skills",
      name: "Chosen",
      resourceNames: ["shared"],
      includeAllResources: false,
      includeNewResources: false,
    })
    document.categories.commands.sets.push({
      id: "chosen-commands",
      name: "Chosen",
      resourceNames: ["allowed"],
      includeAllResources: false,
      includeNewResources: false,
    })
    document.categories.tools.sets.push({
      id: "chosen-tools",
      name: "Chosen",
      resourceNames: ["bash", "read"],
      includeAllResources: false,
      includeNewResources: false,
    })
    document.categories.subagents.sets.push({
      id: "chosen-agents",
      name: "Chosen",
      resourceNames: ["reviewer"],
      includeAllResources: false,
      includeNewResources: false,
    })
    document.presets.push({
      id: "focused",
      name: "Focused",
      skillSetIds: ["chosen-skills"],
      commandSetIds: ["chosen-commands"],
      toolSetIds: ["chosen-tools"],
      subagentSetIds: ["chosen-agents"],
      subagentNames: ["reviewer"],
      executionAgentId: fixture.agentId,
      modelId: "codex-lb/gpt-5.6-luna",
    })
    const loadedCatalog = await providerAgentCatalogLoad(path.resolve(import.meta.dir, "../../.."))
    if (!loadedCatalog.success) throw new Error(loadedCatalog.errorMessage)
    const catalog: ProviderCatalog = {
      ...loadedCatalog.data,
      agents: [
        {
          id: fixture.agentId,
          enabled: true,
          prompt: "primary",
          tools: { bash: false, webfetch: false },
          mode: "primary",
        },
        { id: "reviewer", enabled: true, prompt: "review", tools: { bash: false, webfetch: true }, mode: "subagent" },
      ],
    }
    const options = {
      configurationStore: { gitStore: {} } as ConfigurationStore,
      globalAgentPresetDocumentRead: async () => createResult(document),
      globalSkillsPath,
      globalCommandsPath,
      organizationId: userId,
      projectRootDirs: [root],
      providerAgentCatalog: catalog,
    }
    const input = {
      clientRequestId: `preset-${uuidv7()}`,
      globalAgentPresetId: "focused",
      primaryAgentId: fixture.agentId,
      projectPath: project,
      serverId: fixture.serverId,
      title: "Preset",
    }
    try {
      const created = await sessionCreate(database, userId, input, {
        ...options,
        idempotencyKey: input.clientRequestId,
        requestHash: apiIdempotencyRequestHashCreate(input),
      })
      expect(created).toMatchObject({ success: true, data: { created: true } })
      if (!created.success) return
      expect(created.data.session.skillSelection.activeSkills.map(({ name, source }) => ({ name, source }))).toEqual([
        { name: "local", source: "project" },
        { name: "shared", source: "project" },
      ])
      expect(created.data.session.executionManifest?.skills.snapshots).toEqual(
        created.data.session.skillSelection.activeSkills,
      )
      expect(created.data.session.executionSelection?.tools.primary.tools).toMatchObject({
        bash: true,
        read: true,
        webfetch: false,
      })
      expect(created.data.session.executionManifest?.tools.selectableSubagents.map(({ agentId }) => agentId)).toEqual([
        "reviewer",
      ])
      expect(created.data.session.metadata.globalAgentPreset).toEqual({
        id: "focused",
        commandNames: ["allowed", "blocked", "local"],
      })
      expect(created.data.session.metadata.sessionModelDefault).toEqual({
        agentId: fixture.agentId,
        provider: "codex-lb",
        model: "gpt-5.6-luna",
      })
      const snapshot = runExecutionSnapshotResolve(
        { agentId: fixture.agentId, serverId: fixture.serverId },
        undefined,
        {
          catalog,
          configuration: { model: "old", provider: "deterministic" },
          configurationRevision: "test-revision",
          execution: created.data.session.metadata.sessionModelDefault,
          executionManifest: created.data.session.executionManifest,
          executionSelection: created.data.session.executionSelection,
          skillSelection: created.data.session.skillSelection,
          agentInstructions: created.data.session.instructionSnapshot,
        },
      )
      expect(snapshot).toMatchObject({
        success: true,
        data: { configuration: { model: "gpt-5.6-luna", provider: "codex-lb" } },
      })
      const override = await sessionCreate(
        database,
        userId,
        { ...input, clientRequestId: `override-${uuidv7()}`, modelId: "cliproxyapi/grok-4.5" },
        options,
      )
      expect(override).toMatchObject({
        success: true,
        data: {
          session: {
            metadata: { sessionModelDefault: { agentId: fixture.agentId, provider: "cliproxyapi", model: "grok-4.5" } },
          },
        },
      })
      if (override.success) await sessionDelete(database, userId, override.data.session.id)
      for (const modelId of ["cliproxyapi/gpt-5.6-luna", "codex-lb/not-real", "bad-provider/grok-4.5"]) {
        const invalid = await sessionCreate(
          database,
          userId,
          { ...input, clientRequestId: `invalid-${uuidv7()}`, modelId },
          options,
        )
        expect(invalid).toMatchObject({ success: false })
      }
      document.presets[0]!.modelId = "codex-lb/not-real"
      const replacedDefault = await sessionCreate(
        database,
        userId,
        { ...input, clientRequestId: `replacement-${uuidv7()}`, modelId: "cliproxyapi/grok-4.5" },
        options,
      )
      expect(replacedDefault).toMatchObject({
        success: true,
        data: { session: { metadata: { sessionModelDefault: { provider: "cliproxyapi", model: "grok-4.5" } } } },
      })
      if (replacedDefault.success) await sessionDelete(database, userId, replacedDefault.data.session.id)
      document.presets[0]!.modelId = "codex-lb/gpt-5.6-luna"
      expect(
        await sessionCreate(
          database,
          userId,
          {
            ...input,
            clientRequestId: `blocked-${uuidv7()}`,
            command: { name: "allowed" },
            skillSelection: { presetName: "all" },
          },
          options,
        ),
      ).toMatchObject({
        success: false,
        errorMessage: "The global agent preset cannot be combined with client resource selections.",
      })
      expect(
        await sessionCreate(
          database,
          userId,
          { ...input, clientRequestId: `restricted-${uuidv7()}`, command: { name: "excluded" } },
          options,
        ),
      ).toMatchObject({ success: false, errorMessage: "The requested command could not be found." })
      document.presets.length = 0
      const replayed = await sessionCreate(database, userId, input, {
        ...options,
        idempotencyKey: input.clientRequestId,
        requestHash: apiIdempotencyRequestHashCreate(input),
      })
      expect(replayed).toMatchObject({
        success: true,
        data: { replayed: true, session: { id: created.data.session.id } },
      })
      const conflicting = await sessionCreate(
        database,
        userId,
        { ...input, modelId: "codex-lb/not-real" },
        {
          ...options,
          idempotencyKey: input.clientRequestId,
          requestHash: apiIdempotencyRequestHashCreate({ ...input, modelId: "codex-lb/not-real" }),
        },
      )
      expect(conflicting).toMatchObject({ success: false, code: "idempotency_conflict" })
      const loaded = await sessionLoad(database, userId, userId, created.data.session.id)
      expect(loaded.success && loaded.data.session.executionManifest).toEqual(created.data.session.executionManifest)
      await sessionDelete(database, userId, created.data.session.id)
      expect(
        await sessionCreate(database, userId, { ...input, clientRequestId: `missing-${uuidv7()}` }, options),
      ).toMatchObject({ success: false, errorMessage: "The global agent preset could not be found." })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  },
)

test.skipIf(!databaseAvailable)(
  "project agents join every preset and their effective catalog survives file changes",
  async () => {
    if (userId === undefined) return
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-session-project-agents-"))
    const project = path.join(root, "project")
    const agentDirectory = path.join(project, ".agents", "agents")
    await fs.mkdir(agentDirectory, { recursive: true })
    const loadedCatalog = await providerAgentCatalogLoad(path.resolve(import.meta.dir, "../../.."))
    if (!loadedCatalog.success) throw new Error(loadedCatalog.errorMessage)
    const catalog: ProviderCatalog = {
      ...loadedCatalog.data,
      agents: [
        {
          id: fixture.agentId,
          enabled: true,
          prompt: "global primary",
          tools: { bash: false, webfetch: false },
          mode: "primary",
          provider: "codex-lb",
          model: "gpt-5.6-luna",
        },
        {
          id: "reviewer",
          enabled: true,
          prompt: "global reviewer",
          tools: { bash: false, webfetch: false },
          mode: "subagent",
          provider: "codex-lb",
          model: "gpt-5.6-luna",
        },
      ],
    }
    const document = globalAgentPresetDocumentDefaults()
    document.presets.push({
      id: "no-subagents",
      name: "No subagents",
      executionAgentId: fixture.agentId,
      modelId: "codex-lb/gpt-5.6-luna",
      skillSetIds: [],
      commandSetIds: [],
      toolSetIds: [],
      subagentSetIds: [],
      subagentNames: [],
    })
    const options = {
      configurationStore: { gitStore: {} } as ConfigurationStore,
      globalAgentPresetDocumentRead: async () => createResult(document),
      organizationId: userId,
      projectRootDirs: [root],
      providerAgentCatalog: catalog,
    }
    const agent = (body: string, mode: string, tools = "") =>
      `---\nmode: ${mode}\nprovider: codex-lb\nmodel: gpt-5.6-luna\n${tools}---\n${body}\n`
    await fs.writeFile(path.join(agentDirectory, `${fixture.agentId}.md`), agent("project primary", "primary"))
    await fs.writeFile(
      path.join(agentDirectory, "reviewer.md"),
      agent("project reviewer", "subagent", "tools:\n  bash: true\n  webfetch: false\n"),
    )
    await fs.writeFile(path.join(agentDirectory, "local.md"), agent("project local", "subagent"))
    try {
      const input = {
        clientRequestId: `project-agent-${uuidv7()}`,
        globalAgentPresetId: "no-subagents",
        primaryAgentId: fixture.agentId,
        projectPath: project,
        serverId: fixture.serverId,
        title: "Project agents",
      }
      const created = await sessionCreate(database, userId, input, options)
      expect(created).toMatchObject({ success: true, data: { created: true } })
      if (!created.success) return
      expect(created.data.session.executionSelection?.tools.selectableSubagents).toEqual([
        expect.objectContaining({ agentId: "local" }),
        expect.objectContaining({ agentId: "reviewer", tools: expect.objectContaining({ bash: true }) }),
      ])
      expect(created.data.session.executionManifest?.tools.selectableSubagents.map(({ agentId }) => agentId)).toEqual([
        "local",
        "reviewer",
      ])
      const stored = created.data.session.metadata.projectAgentCatalog as ProviderCatalog
      expect(stored.agents.find(({ id }) => id === fixture.agentId)?.prompt).toBe("project primary")
      expect(stored.agents.find(({ id }) => id === "reviewer")?.prompt).toBe("project reviewer")
      await fs.writeFile(path.join(agentDirectory, `${fixture.agentId}.md`), agent("changed primary", "primary"))
      await fs.rm(path.join(agentDirectory, "reviewer.md"))
      const loaded = await sessionLoad(database, userId, userId, created.data.session.id)
      expect(loaded.success).toBe(true)
      if (loaded.success) {
        const saved = loaded.data.session.metadata.projectAgentCatalog as ProviderCatalog
        expect(saved).toEqual(stored)
        const snapshot = runExecutionSnapshotResolve(
          { agentId: fixture.agentId, serverId: fixture.serverId },
          undefined,
          {
            catalog: saved,
            configuration: { model: "old", provider: "deterministic" },
            configurationRevision: "test-revision",
            executionManifest: loaded.data.session.executionManifest,
            executionSelection: loaded.data.session.executionSelection,
            skillSelection: loaded.data.session.skillSelection,
            agentInstructions: loaded.data.session.instructionSnapshot,
          },
        )
        expect(snapshot).toMatchObject({
          success: true,
          data: { agentPrompt: "project primary", configuration: { model: "gpt-5.6-luna", provider: "codex-lb" } },
        })
        const child = runExecutionSnapshotResolve({ agentId: "reviewer", serverId: fixture.serverId }, undefined, {
          catalog: saved,
          configuration: { model: "old", provider: "deterministic" },
          configurationRevision: "test-revision",
        })
        expect(child).toMatchObject({
          success: true,
          data: { agentPrompt: "project reviewer", configuration: { model: "gpt-5.6-luna", provider: "codex-lb" } },
        })
      }
      await sessionDelete(database, userId, created.data.session.id)
      const withoutPreset = await sessionCreate(
        database,
        userId,
        { ...input, globalAgentPresetId: undefined, clientRequestId: `project-agent-default-${uuidv7()}` },
        options,
      )
      expect(withoutPreset).toMatchObject({ success: true })
      if (withoutPreset.success) {
        expect(
          withoutPreset.data.session.executionSelection?.tools.selectableSubagents.map(({ agentId }) => agentId),
        ).toEqual(["local", "reviewer"])
        await sessionDelete(database, userId, withoutPreset.data.session.id)
      }
      const spoofed = await sessionCreate(
        database,
        userId,
        {
          ...input,
          globalAgentPresetId: undefined,
          metadata: { projectAgentCatalog: catalog },
          clientRequestId: `project-agent-spoof-${uuidv7()}`,
        },
        options,
      )
      expect(spoofed.success).toBe(true)
      if (spoofed.success) {
        expect(
          (spoofed.data.session.metadata.projectAgentCatalog as ProviderCatalog).agents.find(
            ({ id }) => id === fixture.agentId,
          )?.prompt,
        ).toBe("changed primary")
        await sessionDelete(database, userId, spoofed.data.session.id)
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  },
)

test.skipIf(!databaseAvailable)(
  "project-only primary persists its catalog and model without a global agent row",
  async () => {
    if (userId === undefined) return
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-primary-"))
    const project = path.join(root, "project")
    const directory = path.join(project, ".agents", "agents")
    await fs.mkdir(directory, { recursive: true })
    const id = `project-primary-${uuidv7()}`
    const file = path.join(directory, `${id}.md`)
    await fs.writeFile(
      file,
      "---\nmode: primary\nprovider: codex-lb\nmodel: gpt-5.6-luna\n---\nOriginal project prompt",
    )
    try {
      const loadedCatalog = await providerAgentCatalogLoad(path.resolve(import.meta.dir, "../../.."))
      if (!loadedCatalog.success) throw new Error(loadedCatalog.errorMessage)
      const document = globalAgentPresetDocumentDefaults()
      document.presets.push({
        id: "local-primary",
        name: "Local primary",
        executionAgentId: id,
        modelId: "codex-lb/gpt-5.6-luna",
        skillSetIds: [],
        commandSetIds: [],
        toolSetIds: [],
        subagentSetIds: [],
        subagentNames: [],
      })
      const options = {
        organizationId: userId,
        projectRootDirs: [root],
        providerAgentCatalog: loadedCatalog.data,
        configurationStore: { gitStore: {} } as ConfigurationStore,
        globalAgentPresetDocumentRead: async () => createResult(document),
      }
      const input = {
        clientRequestId: `project-primary-${uuidv7()}`,
        globalAgentPresetId: "local-primary",
        modelId: "cliproxyapi/grok-4.5",
        primaryAgentId: id,
        projectPath: project,
        serverId: fixture.serverId,
        title: "Local primary",
      }
      const created = await sessionCreate(database, userId, input, options)
      expect(created).toMatchObject({
        success: true,
        data: {
          session: {
            primaryAgentId: id,
            metadata: { sessionModelDefault: { agentId: id, model: "grok-4.5" } },
          },
        },
      })
      if (!created.success) return
      const withoutPreset = await sessionCreate(
        database,
        userId,
        { ...input, globalAgentPresetId: undefined, modelId: undefined, clientRequestId: `plain-${uuidv7()}` },
        options,
      )
      expect(withoutPreset).toMatchObject({ success: true, data: { session: { primaryAgentId: id } } })
      if (withoutPreset.success) await sessionDelete(database, userId, withoutPreset.data.session.id)
      await fs.writeFile(file, "---\nmode: subagent\nprovider: codex-lb\nmodel: gpt-5.6-luna\n---\nNot a primary")
      const subagent = await sessionCreate(
        database,
        userId,
        { ...input, clientRequestId: `subagent-primary-${uuidv7()}` },
        options,
      )
      expect(subagent).toMatchObject({ success: false, errorMessage: "The project primary agent is unavailable." })
      expect(await database.select().from(agentTable).where(eq(agentTable.id, id))).toEqual([])
      await fs.rm(file)
      const loaded = await sessionLoad(database, userId, userId, created.data.session.id)
      expect(loaded).toMatchObject({
        success: true,
        data: {
          agent: { id },
          session: {
            metadata: {
              projectAgentCatalog: {
                agents: expect.arrayContaining([expect.objectContaining({ id, prompt: "Original project prompt" })]),
              },
            },
          },
        },
      })
      expect(await sessionLoad(database, userId, "another-organization", created.data.session.id)).toMatchObject({
        success: false,
      })
      expect(
        await sessionLoad(database, "development:unknown-session-user", userId, created.data.session.id),
      ).toMatchObject({ success: false })
      await sessionDelete(database, userId, created.data.session.id)
      const missing = await sessionCreate(
        database,
        userId,
        { ...input, clientRequestId: `missing-${uuidv7()}` },
        options,
      )
      expect(missing).toMatchObject({ success: false })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  },
)

test.skipIf(!databaseAvailable)(
  "default preset sets include project overrides and local resources without disabling built-in tools",
  async () => {
    if (userId === undefined) return
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-preset-default-precedence-"))
    const project = path.join(root, "project")
    const globalSkillsPath = path.join(root, "global-skills")
    const globalCommandsPath = path.join(root, "global-commands")
    const projectSkillsPath = path.join(project, ".agents", "skills")
    const projectCommandsPath = path.join(project, ".agents", "commands")
    await Promise.all([
      fs.mkdir(path.join(globalSkillsPath, "shared"), { recursive: true }),
      fs.mkdir(path.join(projectSkillsPath, "shared"), { recursive: true }),
      fs.mkdir(path.join(projectSkillsPath, "local"), { recursive: true }),
      fs.mkdir(globalCommandsPath, { recursive: true }),
      fs.mkdir(projectCommandsPath, { recursive: true }),
    ])
    const skill = (name: string, body: string) => `---\nname: ${name}\ndescription: ${body}\n---\n${body}\n`
    const command = (body: string) => `---\ndescription: ${body}\n---\n${body}\n`
    await Promise.all([
      fs.writeFile(path.join(globalSkillsPath, "shared", "SKILL.md"), skill("shared", "global skill")),
      fs.writeFile(path.join(projectSkillsPath, "shared", "SKILL.md"), skill("shared", "project skill")),
      fs.writeFile(path.join(projectSkillsPath, "local", "SKILL.md"), skill("local", "project local skill")),
      fs.writeFile(path.join(globalCommandsPath, "shared.md"), command("global command")),
      fs.writeFile(path.join(projectCommandsPath, "shared.md"), command("project command")),
      fs.writeFile(path.join(projectCommandsPath, "local.md"), command("project local command")),
    ])
    const document = globalAgentPresetDocumentDefaults()
    document.presets.push({
      id: "defaults",
      name: "Defaults",
      skillSetIds: ["default-skills"],
      commandSetIds: ["default-commands"],
      toolSetIds: ["default-tools"],
      subagentSetIds: [],
      subagentNames: [],
      executionAgentId: fixture.agentId,
      modelId: "codex-lb/gpt-5.6-luna",
    })
    const loadedCatalog = await providerAgentCatalogLoad(path.resolve(import.meta.dir, "../../.."))
    if (!loadedCatalog.success) throw new Error(loadedCatalog.errorMessage)
    const catalog: ProviderCatalog = {
      ...loadedCatalog.data,
      agents: [
        ...loadedCatalog.data.agents,
        {
          id: fixture.agentId,
          enabled: true,
          prompt: "primary",
          tools: { bash: false, webfetch: false },
          mode: "primary",
        },
      ],
    }
    const options = {
      configurationStore: { gitStore: {} } as ConfigurationStore,
      globalAgentPresetDocumentRead: async () => createResult(document),
      globalSkillsPath,
      globalCommandsPath,
      organizationId: userId,
      projectRootDirs: [root],
      providerAgentCatalog: catalog,
    }
    const input = {
      clientRequestId: `default-preset-${uuidv7()}`,
      globalAgentPresetId: "defaults",
      primaryAgentId: fixture.agentId,
      projectPath: project,
      serverId: fixture.serverId,
      title: "Default preset",
    }
    try {
      const created = await sessionCreate(database, userId, input, options)
      expect(created).toMatchObject({ success: true, data: { created: true } })
      if (!created.success) return
      expect(
        created.data.session.skillSelection.activeSkills.map(({ name, source, body }) => ({ name, source, body })),
      ).toEqual([
        { name: "local", source: "project", body: "project local skill" },
        { name: "shared", source: "project", body: "project skill" },
      ])
      expect(created.data.session.metadata.globalAgentPreset).toEqual({
        id: "defaults",
        commandNames: ["local", "shared"],
      })
      const executionSelection = created.data.session.executionSelection
      if (executionSelection === null) throw new Error("The created session is missing its execution selection.")
      expect(executionSelection.tools.primary.tools).toEqual({
        bash: true,
        webfetch: true,
        read: true,
        write: true,
        edit: true,
      })
      const overridden = await sessionCreate(
        database,
        userId,
        { ...input, clientRequestId: `overridden-${uuidv7()}`, command: { name: "shared" } },
        options,
      )
      expect(overridden).toMatchObject({
        success: true,
        data: {
          session: {
            metadata: { command: { expandedUserText: "project command", name: "shared" } },
          },
        },
      })
      const local = await sessionCreate(
        database,
        userId,
        { ...input, clientRequestId: `local-${uuidv7()}`, command: { name: "local" } },
        options,
      )
      expect(local).toMatchObject({
        success: true,
        data: {
          session: {
            metadata: { command: { expandedUserText: "project local command", name: "local" } },
          },
        },
      })
      if (overridden.success) await sessionDelete(database, userId, overridden.data.session.id)
      if (local.success) await sessionDelete(database, userId, local.data.session.id)
      await sessionDelete(database, userId, created.data.session.id)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  },
)
