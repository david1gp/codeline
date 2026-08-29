import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { runChildCreate } from "../src/run/actions/runChildCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runLoad } from "../src/run/actions/runLoad.js"
import { runRetryAttemptCreate } from "../src/run/actions/runRetryAttemptCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionLoad } from "../src/session/actions/sessionLoad.js"
import { skillSelectionDefaultDelete } from "../src/skills/actions/skillSelectionDefaultDelete.js"
import { skillSelectionDefaultLoad } from "../src/skills/actions/skillSelectionDefaultLoad.js"
import { skillSelectionDefaultUpsert } from "../src/skills/actions/skillSelectionDefaultUpsert.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-skill-session-run-"))
const projectRoot = path.join(rootDirectory, "project")
const globalSkillsPath = path.join(rootDirectory, "global", "skills")
const databasePath = path.join(rootDirectory, "db.sqlite")
const userId = `skill-session-user-${uuidv7()}`
const otherUserId = `skill-session-other-user-${uuidv7()}`
const organizationId = `skill-session-organization-${uuidv7()}`
const serverId = `skill-session-server-${uuidv7()}`
const agentId = `skill-session-agent-${uuidv7()}`
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db

beforeAll(async () => {
  await fs.mkdir(path.join(projectRoot, ".agents", "skills", "team", "alpha"), { recursive: true })
  await fs.mkdir(path.join(projectRoot, ".agents", "skills", "team", "beta"), { recursive: true })
  await fs.mkdir(path.join(projectRoot, ".agents", "skill-presets"), { recursive: true })
  await fs.mkdir(path.join(globalSkillsPath, "global"), { recursive: true })
  await fs.writeFile(
    path.join(projectRoot, ".agents", "skills", "team", "alpha", "SKILL.md"),
    ["---", "name: alpha", "description: Alpha project skill", "---", "Original alpha instructions."].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(projectRoot, ".agents", "skills", "team", "beta", "SKILL.md"),
    ["---", "name: beta", "description: Beta project skill", "---", "Beta instructions."].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(globalSkillsPath, "global", "SKILL.md"),
    ["---", "name: global", "description: Global skill", "---", "Original global instructions."].join("\n"),
    "utf8",
  )
  await fs.writeFile(path.join(globalSkillsPath, "global", "reference.md"), "Original global reference.", "utf8")
  await fs.writeFile(
    path.join(projectRoot, ".agents", "skill-presets", "focused.yaml"),
    [
      "version: 1",
      "name: focused",
      "description: Focused skills",
      "includeFolders:",
      "  - team",
      "includeSkills:",
      "  - global",
      "excludeSkills:",
      "  - beta",
    ].join("\n"),
    "utf8",
  )

  await database.insert(applicationUserTable).values([
    { displayName: "Skill Session User", id: userId },
    { displayName: "Skill Session Other User", id: otherUserId },
  ])
  await database.insert(organizationTable).values({
    externalId: organizationId,
    id: organizationId,
    name: "Skill Session Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://skill-session.test",
    id: serverId,
    name: "Skill Session Server",
    organizationId,
  })
  await database.insert(agentTable).values({
    configuration: { model: "skill-session-model", provider: "deterministic" },
    id: agentId,
    name: "Skill Session Agent",
    role: "coding",
    serverId,
  })
})

afterAll(async () => {
  await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
  await fs.rm(rootDirectory, { force: true, recursive: true })
})

test("persists user/project defaults and carries an immutable active skill snapshot through sessions, retries, and children", async () => {
  const defaultPreference = await skillSelectionDefaultUpsert(
    database,
    userId,
    {
      override: { disabledSkills: ["alpha"], enabledSkills: ["beta"] },
      presetName: "focused",
      projectPath: projectRoot,
    },
    { projectRootDirs: [rootDirectory] },
  )
  expect(defaultPreference).toMatchObject({
    success: true,
    data: {
      presetName: "focused",
      projectPath: projectRoot,
      selectionOverride: { disabledSkills: ["alpha"], enabledSkills: ["beta"] },
      revision: 1,
    },
  })
  expect(
    await skillSelectionDefaultLoad(database, otherUserId, projectRoot, { projectRootDirs: [rootDirectory] }),
  ).toEqual({
    success: true,
    data: undefined,
  })

  const created = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `skill-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: agentId,
      projectPath: projectRoot,
      serverId,
      title: "Skill snapshot session",
    },
    { globalSkillsPath, organizationId, projectRootDirs: [rootDirectory] },
  )
  expect(created).toMatchObject({ success: true, data: { created: true } })
  if (!created.success) return
  expect(created.data.session.skillSelection).toMatchObject({
    activeSkills: [{ name: "global" }],
    excludedSkillNames: ["alpha", "beta"],
    presetName: "focused",
  })
  expect(created.data.session.executionManifest?.skills).toMatchObject({
    presetName: "focused",
    snapshots: [{ name: "global", body: "Original global instructions." }],
  })
  if (created.data.session.executionManifest === null) return
  const originalManifest = structuredClone(created.data.session.executionManifest)

  const loaded = await sessionLoad(database, userId, organizationId, created.data.session.id)
  expect(loaded).toMatchObject({
    success: true,
    data: { session: { skillSelection: created.data.session.skillSelection } },
  })
  if (!loaded.success || loaded.data.session.executionManifest === null) return
  expect(loaded.data.session.executionManifest.skills).toEqual(originalManifest?.skills)

  await fs.writeFile(
    path.join(globalSkillsPath, "global", "SKILL.md"),
    ["---", "name: global", "description: Changed global skill", "---", "Changed after session creation."].join("\n"),
    "utf8",
  )
  await fs.writeFile(path.join(globalSkillsPath, "global", "reference.md"), "Changed reference.", "utf8")
  const unchanged = await sessionLoad(database, userId, organizationId, created.data.session.id)
  expect(unchanged).toMatchObject({ success: true })
  if (!unchanged.success) return
  expect(unchanged.data.session.executionManifest?.skills).toEqual(originalManifest?.skills)
  expect(unchanged.data.session.executionManifest?.skills.snapshots[0]?.content).toContain(
    "Original global instructions.",
  )

  const clientRunId = `skill-run-${uuidv7()}`
  const run = await runCreate(database, userId, created.data.session.id, {
    budget: { maxAttempts: 2, maxChildDepth: 1, maxChildRuns: 1, maxDurationMs: 10_000 },
    clientRunId,
    snapshot: {
      configuration: {
        model: "skill-session-model",
        provider: "deterministic",
        tools: { bash: false, webfetch: false },
      },
      configurationRevision: "skill-session-revision",
      executionManifest: originalManifest,
      target: { agentId, serverId },
    },
    streamId: `skill-stream-${uuidv7()}`,
  })
  expect(run).toMatchObject({ success: true, data: { created: true } })
  if (!run.success) return
  expect(run.data.run.snapshot.executionManifest?.skills).toEqual(originalManifest?.skills)
  expect(run.data.attempt.snapshot.executionManifest?.skills).toEqual(originalManifest?.skills)

  expect(
    await runTransition(database, userId, created.data.session.id, run.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })
  expect(
    await runTransition(database, userId, created.data.session.id, run.data.run.id, {
      failure: { code: "provider_timeout", message: "The skill run timed out." },
      status: "failed",
    }),
  ).toMatchObject({ success: true })
  const retry = await runRetryAttemptCreate(database, userId, created.data.session.id, run.data.run.id, {
    now: () => new Date(run.data.run.deadlineAt.getTime() - 1),
  })
  expect(retry).toMatchObject({ success: true, data: { attempt: { ordinal: 2 } } })
  if (!retry.success) return
  expect(retry.data.attempt.snapshot.executionManifest?.skills).toEqual(originalManifest?.skills)

  expect(
    await runTransition(database, userId, created.data.session.id, run.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })
  const child = await runChildCreate(database, userId, created.data.session.id, {
    delegationKey: `skill-child-${uuidv7()}`,
    parentAttemptId: retry.data.attempt.id,
    parentRunId: run.data.run.id,
    task: "Preserve the active skill snapshot.",
  })
  expect(child).toMatchObject({ success: true, data: { created: true } })
  if (!child.success) return
  expect(child.data.run.snapshot.executionManifest?.skills).toEqual(originalManifest?.skills)
  expect(child.data.attempt.snapshot.executionManifest?.skills).toEqual(originalManifest?.skills)
  expect(await runLoad(database, userId, created.data.session.id, clientRunId)).toMatchObject({
    success: true,
    data: { run: { snapshot: { executionManifest: { skills: originalManifest?.skills } } } },
  })

  await skillSelectionDefaultDelete(database, userId, projectRoot, { projectRootDirs: [rootDirectory] })
})

test("defaults new sessions to All and keeps its resolved skill snapshot stable", async () => {
  const created = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `skill-session-all-${uuidv7()}`,
      metadata: {},
      primaryAgentId: agentId,
      projectPath: projectRoot,
      serverId,
      title: "All skill snapshot session",
    },
    { globalSkillsPath, organizationId, projectRootDirs: [rootDirectory] },
  )
  expect(created).toMatchObject({ success: true, data: { created: true } })
  if (!created.success) return

  expect(created.data.session.skillSelection).toMatchObject({
    activeSkills: [{ name: "alpha" }, { name: "beta" }, { name: "global" }],
    excludedSkillNames: [],
    presetName: "all",
  })
  const originalManifest = structuredClone(created.data.session.executionManifest)

  await fs.mkdir(path.join(projectRoot, ".agents", "skills", "team", "late"), { recursive: true })
  await fs.writeFile(
    path.join(projectRoot, ".agents", "skills", "team", "late", "SKILL.md"),
    ["---", "name: late", "description: Late project skill", "---", "Added after session creation."].join("\n"),
    "utf8",
  )
  const unchanged = await sessionLoad(database, userId, organizationId, created.data.session.id)
  expect(unchanged).toMatchObject({ success: true })
  if (!unchanged.success) return
  expect(unchanged.data.session.skillSelection).toEqual(created.data.session.skillSelection)
  expect(unchanged.data.session.executionManifest).toEqual(originalManifest)
})
