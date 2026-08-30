import { expect, test } from "bun:test"
import * as fsSync from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { projectRegistryProjectPathAuthorize } from "../src/project/projectRegistryProjectPathAuthorize.js"

test("rejects a configured root replaced after alias and target validation", async () => {
  const homePath = await fs.realpath(os.homedir())
  const filesystemRoot = await fs.mkdtemp(path.join(homePath, ".codeline-project-registry-authorization-"))
  const configuredRoot = path.join(filesystemRoot, "configured-root")
  const replacementRoot = path.join(filesystemRoot, "replacement-root")
  const canonicalPath = path.join(filesystemRoot, "project")
  const authorizationPath = path.join(configuredRoot, "project")

  try {
    await fs.mkdir(configuredRoot)
    await fs.mkdir(replacementRoot)
    await fs.mkdir(canonicalPath)
    await fs.symlink(canonicalPath, authorizationPath)
    await fs.symlink(canonicalPath, path.join(replacementRoot, "project"))

    let rootIterations = 0
    const rootDirs = Object.assign([configuredRoot], {
      [Symbol.iterator]: function* () {
        rootIterations += 1
        if (rootIterations === 2) {
          fsSync.rmSync(configuredRoot, { force: true, recursive: true })
          fsSync.symlinkSync(replacementRoot, configuredRoot)
        }
        yield configuredRoot
      },
    })

    const authorized = await projectRegistryProjectPathAuthorize({ authorizationPath, path: canonicalPath }, rootDirs)

    expect(authorized.success).toBe(false)
    expect(rootIterations).toBe(2)
  } finally {
    await fs.rm(filesystemRoot, { force: true, recursive: true })
  }
})
