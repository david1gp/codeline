import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { projectRegistryRepositoryDelete } from "../src/project/db/projectRegistryRepositoryDelete.js"
import { projectRegistryRepositoryList } from "../src/project/db/projectRegistryRepositoryList.js"
import { projectRegistryRepositoryResolve } from "../src/project/db/projectRegistryRepositoryResolve.js"
import { projectRegistryRepositoryUpdate } from "../src/project/db/projectRegistryRepositoryUpdate.js"
import { projectRegistryRepositoryUpsert } from "../src/project/db/projectRegistryRepositoryUpsert.js"
import { projectRegistryPathCanonicalize } from "../src/project/projectRegistryPathCanonicalize.js"

async function temporaryDatabaseCreate() {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-repositories."))
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
  }
}

const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test("project registry canonical paths retain their safety rules", async () => {
  const rootsDirectory = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-canonical."))
  const projectPath = path.join(rootsDirectory, "project")
  const outsidePath = await mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-outside."))
  const symlinkPath = path.join(rootsDirectory, "linked-project")
  const filePath = path.join(rootsDirectory, "project-file")

  try {
    await mkdir(projectPath)
    await symlink(projectPath, symlinkPath)
    await writeFile(filePath, "not a directory")

    const canonical = await projectRegistryPathCanonicalize(path.join(projectPath, "."), [rootsDirectory])
    expect(canonical).toEqual({ success: true, data: projectPath })
    expect((await projectRegistryPathCanonicalize("relative-project", [rootsDirectory])).success).toBe(false)
    expect((await projectRegistryPathCanonicalize("~", [rootsDirectory])).success).toBe(false)
    expect((await projectRegistryPathCanonicalize(symlinkPath, [rootsDirectory])).success).toBe(false)
    expect((await projectRegistryPathCanonicalize(outsidePath, [rootsDirectory])).success).toBe(false)
    expect((await projectRegistryPathCanonicalize(filePath, [rootsDirectory])).success).toBe(false)
  } finally {
    await rm(rootsDirectory, { force: true, recursive: true })
    await rm(outsidePath, { force: true, recursive: true })
  }
})

test("project registry repositories isolate users across every operation", async () => {
  const fixture = await temporaryDatabaseCreate()
  const projectPath = path.resolve("/tmp/codeline-project-registry-shared")
  const secondProjectPath = path.resolve("/tmp/codeline-project-registry-second")
  const firstUserId = "project-registry-repository-user-one"
  const secondUserId = "project-registry-repository-user-two"

  try {
    await fixture.database.insert(applicationUserTable).values([
      { id: firstUserId, displayName: "Project Registry Repository User One" },
      { id: secondUserId, displayName: "Project Registry Repository User Two" },
    ])

    const firstProject = await projectRegistryRepositoryUpsert(fixture.database, firstUserId, {
      displayName: "First User Project",
      path: projectPath,
    })
    const secondProject = await projectRegistryRepositoryUpsert(fixture.database, secondUserId, {
      displayName: "Second User Project",
      path: projectPath,
    })
    const firstSecondProject = await projectRegistryRepositoryUpsert(fixture.database, firstUserId, {
      path: secondProjectPath,
    })
    expect(firstProject.success).toBe(true)
    expect(secondProject.success).toBe(true)
    expect(firstSecondProject.success).toBe(true)
    if (!firstProject.success || !secondProject.success || !firstSecondProject.success) return

    expect(firstProject.data.id).toMatch(uuidv7Pattern)
    expect(secondProject.data.id).toMatch(uuidv7Pattern)
    expect(firstProject.data.id).not.toBe(secondProject.data.id)

    const preservedName = await projectRegistryRepositoryUpsert(fixture.database, firstUserId, { path: projectPath })
    expect(preservedName).toMatchObject({
      success: true,
      data: {
        createdAt: firstProject.data.createdAt,
        displayName: "First User Project",
        id: firstProject.data.id,
        path: projectPath,
      },
    })
    if (!preservedName.success) return
    expect(preservedName.data.displayName).toBe("First User Project")
    expect(preservedName.data.id).toBe(firstProject.data.id)

    const firstProjects = await projectRegistryRepositoryList(fixture.database, firstUserId)
    const secondProjects = await projectRegistryRepositoryList(fixture.database, secondUserId)
    expect(firstProjects.success).toBe(true)
    expect(secondProjects.success).toBe(true)
    if (!firstProjects.success || !secondProjects.success) return
    expect(firstProjects.data.map((project) => project.path).sort()).toEqual([projectPath, secondProjectPath].sort())
    expect(secondProjects.data.map((project) => project.path)).toEqual([projectPath])

    expect(await projectRegistryRepositoryResolve(fixture.database, firstUserId, secondProject.data.id)).toMatchObject({
      success: false,
    })
    expect(await projectRegistryRepositoryResolve(fixture.database, secondUserId, firstProject.data.id)).toMatchObject({
      success: false,
    })

    const updated = await projectRegistryRepositoryUpdate(fixture.database, firstUserId, firstProject.data.id, {
      displayName: null,
    })
    expect(updated).toMatchObject({
      success: true,
      data: { id: firstProject.data.id, path: projectPath, displayName: null },
    })
    expect(
      await projectRegistryRepositoryUpdate(fixture.database, secondUserId, firstProject.data.id, {
        displayName: "Should not update",
      }),
    ).toMatchObject({ success: false })

    expect(await projectRegistryRepositoryDelete(fixture.database, firstUserId, secondProject.data.id)).toMatchObject({
      success: false,
    })
    expect(await projectRegistryRepositoryDelete(fixture.database, firstUserId, firstProject.data.id)).toMatchObject({
      success: true,
    })
    expect(await projectRegistryRepositoryResolve(fixture.database, secondUserId, secondProject.data.id)).toMatchObject(
      {
        success: true,
        data: { id: secondProject.data.id, path: projectPath, displayName: "Second User Project" },
      },
    )
  } finally {
    await fixture.dispose()
  }
})
