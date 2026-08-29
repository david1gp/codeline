import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { projectRegistryRepositoryDelete } from "../src/project/db/projectRegistryRepositoryDelete.js"
import { projectRegistrySessionPathBackfillTable } from "../src/project/db/projectRegistrySessionPathBackfillTable.js"
import { projectTable } from "../src/project/db/projectTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

async function temporaryDatabaseCreate() {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry."))
  const filePath = path.join(directoryPath, "db.sqlite")
  const migrated = await databaseMigrate(filePath)
  if (!migrated.success) {
    await rm(directoryPath, { force: true, recursive: true })
    throw new Error(migrated.errorMessage)
  }

  const connection = databaseConnectionCreate(filePath)
  return {
    database: connection.db,
    dispose: async () => {
      connection.client.close()
      await rm(directoryPath, { force: true, recursive: true })
    },
    filePath,
  }
}

test("project registry migration creates the user-scoped table and constraints", async () => {
  const fixture = await temporaryDatabaseCreate()
  const client = createClient({ url: `file://${fixture.filePath}` })

  try {
    expect(databaseSchema.projectTable).toBe(projectTable)
    const columns = await client.execute("PRAGMA table_info('project')")
    expect(columns.rows.map((row) => row.name)).toEqual([
      "id",
      "user_id",
      "path",
      "display_name",
      "created_at",
      "updated_at",
    ])

    const indexes = await client.execute("PRAGMA index_list('project')")
    const indexNames = indexes.rows.map((row) => row.name)
    expect(indexNames).toContain("project_user_updated_idx")
    expect(indexNames).toContain("project_user_path_unique")

    const foreignKeys = await client.execute("PRAGMA foreign_key_list('project')")
    expect(foreignKeys.rows).toMatchObject([{ table: "identity_user", on_delete: "CASCADE" }])
  } finally {
    client.close()
    await fixture.dispose()
  }
})

test("project registry persistence is user-scoped and retains nullable names and timestamps", async () => {
  const fixture = await temporaryDatabaseCreate()
  const { database } = fixture
  const projectPath = path.resolve("/tmp/codeline-project-registry-persistence")

  try {
    await database.insert(applicationUserTable).values([
      { id: "project-user-one", displayName: "Project User One" },
      { id: "project-user-two", displayName: "Project User Two" },
    ])

    await database.insert(projectTable).values([
      { id: "project-one", userId: "project-user-one", path: projectPath, displayName: null },
      { id: "project-two", userId: "project-user-two", path: projectPath, displayName: "Shared Project" },
    ])

    const projects = await database
      .select({ userId: projectTable.userId, path: projectTable.path, displayName: projectTable.displayName })
      .from(projectTable)
      .orderBy(projectTable.userId)
    expect(projects).toEqual([
      { userId: "project-user-one", path: projectPath, displayName: null },
      { userId: "project-user-two", path: projectPath, displayName: "Shared Project" },
    ])

    const [stored] = await database.select().from(projectTable).where(eq(projectTable.id, "project-one"))
    expect(stored?.createdAt).toBeInstanceOf(Date)
    expect(stored?.updatedAt).toBeInstanceOf(Date)
  } finally {
    await fixture.dispose()
  }
})

test("project registry backfill does not restore removed projects on later migrations", async () => {
  const fixture = await temporaryDatabaseCreate()
  const { database } = fixture
  const rootsDirectory = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-roots."))
  const validProject = path.join(rootsDirectory, "valid-project")
  const outsideProject = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-outside."))
  const symlinkProject = path.join(rootsDirectory, "symlink-project")
  const missingProject = path.join(rootsDirectory, "missing-project")
  const organizationId = "project-registry-organization"
  const serverId = "project-registry-server"
  const agentId = "project-registry-agent"

  try {
    await mkdir(validProject)
    await symlink(validProject, symlinkProject)
    await database.insert(applicationUserTable).values([
      { id: "project-registry-user-one", displayName: "Project Registry User One" },
      { id: "project-registry-user-two", displayName: "Project Registry User Two" },
    ])
    await database.insert(organizationTable).values({
      id: organizationId,
      externalId: organizationId,
      name: "Project Registry Organization",
    })
    await database.insert(serverTable).values({
      id: serverId,
      organizationId,
      name: "Project Registry Server",
      endpoint: "https://project-registry.test",
    })
    await database.insert(agentTable).values({ id: agentId, serverId, name: "Project Registry Agent", role: "coding" })

    await database.insert(sessionTable).values([
      {
        id: "project-registry-session-valid",
        userId: "project-registry-user-one",
        serverId,
        primaryAgentId: agentId,
        title: "Valid",
        clientRequestId: "project-registry-request-valid",
        projectPath: `${validProject}/.`,
      },
      {
        id: "project-registry-session-duplicate",
        userId: "project-registry-user-one",
        serverId,
        primaryAgentId: agentId,
        title: "Duplicate",
        clientRequestId: "project-registry-request-duplicate",
        projectPath: validProject,
      },
      {
        id: "project-registry-session-other-user",
        userId: "project-registry-user-two",
        serverId,
        primaryAgentId: agentId,
        title: "Other User",
        clientRequestId: "project-registry-request-other-user",
        projectPath: validProject,
      },
      {
        id: "project-registry-session-home",
        userId: "project-registry-user-one",
        serverId,
        primaryAgentId: agentId,
        title: "Home",
        clientRequestId: "project-registry-request-home",
        projectPath: "~",
      },
      {
        id: "project-registry-session-relative",
        userId: "project-registry-user-one",
        serverId,
        primaryAgentId: agentId,
        title: "Relative",
        clientRequestId: "project-registry-request-relative",
        projectPath: "valid-project",
      },
      {
        id: "project-registry-session-missing",
        userId: "project-registry-user-one",
        serverId,
        primaryAgentId: agentId,
        title: "Missing",
        clientRequestId: "project-registry-request-missing",
        projectPath: missingProject,
      },
      {
        id: "project-registry-session-symlink",
        userId: "project-registry-user-one",
        serverId,
        primaryAgentId: agentId,
        title: "Symlink",
        clientRequestId: "project-registry-request-symlink",
        projectPath: symlinkProject,
      },
      {
        id: "project-registry-session-outside",
        userId: "project-registry-user-one",
        serverId,
        primaryAgentId: agentId,
        title: "Outside",
        clientRequestId: "project-registry-request-outside",
        projectPath: outsideProject,
      },
    ])

    const sessionsBefore = await database.select().from(sessionTable).orderBy(sessionTable.id)
    const firstBackfill = await databaseMigrate(fixture.filePath, { projectRootDirs: [rootsDirectory] })
    expect(firstBackfill.success).toBe(true)

    const projectsAfterFirstBackfill = await database.select().from(projectTable).orderBy(projectTable.userId)
    expect(projectsAfterFirstBackfill).toMatchObject([
      { userId: "project-registry-user-one", path: validProject, displayName: null },
      { userId: "project-registry-user-two", path: validProject, displayName: null },
    ])
    expect(
      projectsAfterFirstBackfill.every(
        ({ createdAt, updatedAt }) => createdAt instanceof Date && updatedAt instanceof Date,
      ),
    ).toBe(true)
    expect(projectsAfterFirstBackfill.every(({ id }) => uuidv7Pattern.test(id))).toBe(true)

    const removed = await projectRegistryRepositoryDelete(
      database,
      "project-registry-user-one",
      projectsAfterFirstBackfill.find(({ userId }) => userId === "project-registry-user-one")?.id ??
        "missing-project-id",
    )
    expect(removed.success).toBe(true)

    const secondBackfill = await databaseMigrate(fixture.filePath, { projectRootDirs: [rootsDirectory] })
    expect(secondBackfill.success).toBe(true)
    const projectsAfterSecondBackfill = await database.select().from(projectTable).orderBy(projectTable.userId)
    expect(projectsAfterSecondBackfill).toEqual(
      projectsAfterFirstBackfill.filter(({ userId }) => userId === "project-registry-user-two"),
    )
    expect(await database.select().from(sessionTable).orderBy(sessionTable.id)).toEqual(sessionsBefore)
  } finally {
    await fixture.dispose()
    await rm(rootsDirectory, { force: true, recursive: true })
    await rm(outsideProject, { force: true, recursive: true })
  }
})

test("project registry backfill runs when an upgraded database has no completion marker", async () => {
  const fixture = await temporaryDatabaseCreate()
  const { database } = fixture
  const client = createClient({ url: `file://${fixture.filePath}` })
  const rootsDirectory = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-upgrade-roots."))
  const validProject = path.join(rootsDirectory, "valid-project")
  const organizationId = "project-registry-upgrade-organization"
  const serverId = "project-registry-upgrade-server"
  const agentId = "project-registry-upgrade-agent"
  let clientClosed = false

  try {
    await mkdir(validProject)
    await database.insert(applicationUserTable).values({
      id: "project-registry-upgrade-user",
      displayName: "Project Registry Upgrade User",
    })
    await database.insert(organizationTable).values({
      id: organizationId,
      externalId: organizationId,
      name: "Project Registry Upgrade Organization",
    })
    await database.insert(serverTable).values({
      id: serverId,
      organizationId,
      name: "Project Registry Upgrade Server",
      endpoint: "https://project-registry-upgrade.test",
    })
    await database.insert(agentTable).values({
      id: agentId,
      serverId,
      name: "Project Registry Upgrade Agent",
      role: "coding",
    })
    await database.insert(sessionTable).values({
      id: "project-registry-upgrade-session",
      userId: "project-registry-upgrade-user",
      serverId,
      primaryAgentId: agentId,
      title: "Upgrade",
      clientRequestId: "project-registry-upgrade-request",
      projectPath: validProject,
    })

    await client.execute(
      "DELETE FROM __drizzle_migrations WHERE created_at IN (SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 2)",
    )
    await client.execute("DROP TABLE project_registry_session_path_backfill")
    client.close()
    clientClosed = true

    const migrated = await databaseMigrate(fixture.filePath, { projectRootDirs: [rootsDirectory] })
    expect(migrated.success).toBe(true)
    expect(await database.select().from(projectTable)).toMatchObject([
      { userId: "project-registry-upgrade-user", path: validProject, displayName: null },
    ])
    expect(await database.select().from(projectRegistrySessionPathBackfillTable)).toHaveLength(1)
  } finally {
    if (!clientClosed) client.close()
    await fixture.dispose()
    await rm(rootsDirectory, { force: true, recursive: true })
  }
})

test("project registry migration replaces legacy IDs with UUIDv7 IDs", async () => {
  const fixture = await temporaryDatabaseCreate()
  const client = createClient({ url: `file://${fixture.filePath}` })
  const legacyProjectId = "01234567-89AB-7CDE-8F01-23456789ABCD"

  try {
    await fixture.database.insert(applicationUserTable).values({
      id: "project-registry-migration-user",
      displayName: "Project Registry Migration User",
    })
    await fixture.database.insert(projectTable).values({
      id: legacyProjectId,
      userId: "project-registry-migration-user",
      path: "/tmp/codeline-project-registry-migration",
      displayName: "Legacy Project",
    })

    const migration = await Bun.file(
      new URL("../src/database/migrations/0009_persisted_project_uuidv7.sql", import.meta.url),
    ).text()
    await client.execute(migration)

    const projects = await fixture.database.select().from(projectTable)
    expect(projects).toMatchObject([
      {
        userId: "project-registry-migration-user",
        path: "/tmp/codeline-project-registry-migration",
        displayName: "Legacy Project",
      },
    ])
    expect(projects[0]?.id).toMatch(uuidv7Pattern)
    expect(projects[0]?.id).not.toBe(legacyProjectId)
  } finally {
    client.close()
    await fixture.dispose()
  }
})

test("project registry migration replaces malformed UUID-shaped IDs and preserves valid UUIDv7 IDs idempotently", async () => {
  const fixture = await temporaryDatabaseCreate()
  const client = createClient({ url: `file://${fixture.filePath}` })
  const malformedProjectId = "01234567-89ab-7cde-8f01-2345678-9abc"
  const validProjectId = "01234567-89ab-7cde-8f01-23456789abcd"

  try {
    await fixture.database.insert(applicationUserTable).values({
      id: "project-registry-migration-predicate-user",
      displayName: "Project Registry Migration Predicate User",
    })
    await fixture.database.insert(projectTable).values([
      {
        id: malformedProjectId,
        userId: "project-registry-migration-predicate-user",
        path: "/tmp/codeline-project-registry-malformed",
        displayName: "Malformed Project",
      },
      {
        id: validProjectId,
        userId: "project-registry-migration-predicate-user",
        path: "/tmp/codeline-project-registry-valid",
        displayName: "Valid Project",
      },
    ])

    const migration = await Bun.file(
      new URL("../src/database/migrations/0009_persisted_project_uuidv7.sql", import.meta.url),
    ).text()
    await client.execute(migration)

    const projectsAfterFirstMigration = await fixture.database.select().from(projectTable).orderBy(projectTable.path)
    const replacedProject = projectsAfterFirstMigration.find(({ path: projectPath }) =>
      projectPath.endsWith("malformed"),
    )
    expect(replacedProject?.id).toMatch(uuidv7Pattern)
    expect(replacedProject?.id).not.toBe(malformedProjectId)
    expect(projectsAfterFirstMigration.find(({ path: projectPath }) => projectPath.endsWith("valid"))?.id).toBe(
      validProjectId,
    )

    await client.execute(migration)

    const projectsAfterSecondMigration = await fixture.database.select().from(projectTable).orderBy(projectTable.path)
    expect(projectsAfterSecondMigration).toEqual(projectsAfterFirstMigration)
  } finally {
    client.close()
    await fixture.dispose()
  }
})

test("project registry backfill retries after empty roots are configured", async () => {
  const fixture = await temporaryDatabaseCreate()
  const { database } = fixture
  const rootsDirectory = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-retry-roots."))
  const validProject = path.join(rootsDirectory, "valid-project")
  const organizationId = "project-registry-retry-organization"
  const serverId = "project-registry-retry-server"
  const agentId = "project-registry-retry-agent"

  try {
    await mkdir(validProject)
    await database.insert(applicationUserTable).values({ id: "project-registry-retry-user", displayName: "Retry User" })
    await database.insert(organizationTable).values({
      id: organizationId,
      externalId: organizationId,
      name: "Project Registry Retry Organization",
    })
    await database.insert(serverTable).values({
      id: serverId,
      organizationId,
      name: "Project Registry Retry Server",
      endpoint: "https://project-registry-retry.test",
    })
    await database
      .insert(agentTable)
      .values({ id: agentId, serverId, name: "Project Registry Retry Agent", role: "coding" })
    await database.insert(sessionTable).values({
      id: "project-registry-retry-session",
      userId: "project-registry-retry-user",
      serverId,
      primaryAgentId: agentId,
      title: "Retry",
      clientRequestId: "project-registry-retry-request",
      projectPath: validProject,
    })

    expect(await database.select().from(projectRegistrySessionPathBackfillTable)).toHaveLength(0)

    const absentRoots = await databaseMigrate(fixture.filePath)
    expect(absentRoots.success).toBe(true)
    expect(await database.select().from(projectRegistrySessionPathBackfillTable)).toHaveLength(0)

    const emptyRoots = await databaseMigrate(fixture.filePath, { projectRootDirs: [] })
    expect(emptyRoots.success).toBe(true)
    expect(await database.select().from(projectRegistrySessionPathBackfillTable)).toHaveLength(0)
    expect(await database.select().from(projectTable)).toHaveLength(0)

    const validRoots = await databaseMigrate(fixture.filePath, { projectRootDirs: [rootsDirectory] })
    expect(validRoots.success).toBe(true)
    expect(await database.select().from(projectTable)).toMatchObject([
      { userId: "project-registry-retry-user", path: validProject, displayName: null },
    ])
    expect(await database.select().from(projectRegistrySessionPathBackfillTable)).toHaveLength(1)
  } finally {
    await fixture.dispose()
    await rm(rootsDirectory, { force: true, recursive: true })
  }
})
