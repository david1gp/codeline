import { randomBytes } from "node:crypto"
import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { appCreate } from "../app/appCreate.js"
import { configurationStoreCreate } from "../configuration/configurationStoreCreate.js"
import { configurationStoreTargetReconcile } from "../configuration/configurationStoreTargetReconcile.js"
import { projectRootConfigurationParse } from "../configuration/projectRootConfigurationParse.js"
import { databaseConnectionClose } from "../database/databaseConnectionClose.js"
import { databaseCreate } from "../database/databaseCreate.js"
import { databaseMigrate } from "../database/databaseMigrate.js"
import { localRuntimeIdentityProvision } from "../identity/actions/localRuntimeIdentityProvision.js"
import { journalCursorCodecCreate } from "../journal/actions/journalCursorCodecCreate.js"
import { projectDirectoryCanonicalPathResolve } from "../project/actions/projectDirectoryCanonicalPathResolve.js"
import { providerAgentCatalogLoad } from "../providers/catalog/providerAgentCatalogLoad.js"
import { serverRuntimeCreate } from "../server/serverRuntimeCreate.js"
import { cliLocalRuntimeLockAcquire } from "./cliLocalRuntimeLockAcquire.js"
import { cliLocalTargetProvision } from "./cliLocalTargetProvision.js"

type CliLocalRuntimeOptions = {
  cwd?: string
  project?: string
  environment?: NodeJS.ProcessEnv
  catalogRoot?: string
  appCreate?: typeof appCreate
}

export async function cliLocalRuntimeCreate(options: CliLocalRuntimeOptions = {}) {
  const op = "cliLocalRuntimeCreate"
  const environment = options.environment ?? process.env
  const home = environment.HOME && isAbsolute(environment.HOME) ? environment.HOME : homedir()
  const xdg = environment.XDG_DATA_HOME
  const dataHome = xdg && isAbsolute(xdg) ? xdg : join(home, ".local", "share")
  const dataDirectory = join(dataHome, "codeline")
  const databasePath = join(dataDirectory, "db.sqlite")
  const databaseUrl = pathToFileURL(databasePath).href
  const cwd = resolve(options.cwd ?? process.cwd())
  const project = await projectDirectoryCanonicalPathResolve(resolve(cwd, options.project ?? "."))
  if (!project.success) return createResultError(op, project.errorMessage)
  const roots = projectRootConfigurationParse(
    environment.CODELINE_PROJECT_ROOTS?.trim() ? environment.CODELINE_PROJECT_ROOTS : JSON.stringify([home]),
  )
  if (!roots.success) return roots
  const canonicalRoots: string[] = []
  for (const root of roots.data) {
    const canonical = await projectDirectoryCanonicalPathResolve(resolve(cwd, root))
    if (!canonical.success) return createResultError(op, `The configured project root is unavailable: ${root}`)
    if (!canonicalRoots.includes(canonical.data)) canonicalRoots.push(canonical.data)
  }
  if (
    !canonicalRoots.some((root) => {
      const child = relative(root, project.data)
      return child === "" || (child !== ".." && !child.startsWith("../") && !isAbsolute(child))
    })
  )
    return createResultError(op, "The local project is outside the configured project roots.")

  const catalogRoot = options.catalogRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "../..")
  const catalog = await providerAgentCatalogLoad(catalogRoot)
  if (!catalog.success) return catalog
  try {
    await mkdir(dataDirectory, { recursive: true, mode: 0o700 })
    if (!(await projectDirectoryCanonicalPathResolve(dataDirectory)).success)
      return createResultError(op, "The local data directory is not canonical.")
    await chmod(dataDirectory, 0o700)
  } catch {
    return createResultError(op, "The local data directory could not be prepared.")
  }
  const lock = await cliLocalRuntimeLockAcquire(dataDirectory)
  if (!lock.success) return lock

  let runtime: Awaited<ReturnType<typeof serverRuntimeCreate>> | undefined
  let failure: string | undefined
  let output:
    | {
        fetch: (request: Request) => Promise<Response>
        shutdown: () => Promise<Result<void>>
        projectPath: string
        projectRootDirs: string[]
        databasePath: string
        dataDirectory: string
        identity: { userId: string; organizationId: string }
        target: { serverId: string; agentId: string | undefined }
      }
    | undefined
  try {
    const secretPath = join(dataDirectory, "journal-secret")
    try {
      await writeFile(secretPath, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 })
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
    }
    if (!(await lstat(secretPath)).isFile()) throw new Error("Invalid journal secret")
    await chmod(secretPath, 0o600)
    const secret = (await readFile(secretPath, "utf8")).trim()
    if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Invalid journal secret")
    const codec = journalCursorCodecCreate({ randomBytes, secret })
    if (!codec.success) throw new Error(codec.errorMessage)

    const storePath = join(dataDirectory, "configuration-store")
    await mkdir(storePath, { recursive: true, mode: 0o700 })
    if (!(await projectDirectoryCanonicalPathResolve(storePath)).success)
      throw new Error("The local configuration directory is not canonical.")
    await chmod(storePath, 0o700)
    try {
      if (!(await lstat(databasePath)).isFile()) throw new Error("Invalid local database path")
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
    }
    const store = await configurationStoreCreate({
      authorEmail: "local@codeline.invalid",
      authorName: "Codeline Local",
      branch: "main",
      dir: storePath,
    })
    if (!store.success) throw new Error(store.errorMessage)
    const migrated = await databaseMigrate(databasePath, { projectRootDirs: canonicalRoots })
    if (!migrated.success) throw new Error(migrated.errorMessage)
    await chmod(databasePath, 0o600)
    const connection = databaseCreate({ databaseUrl, nodeEnv: "production" }, databasePath)
    if (!connection.success) throw new Error(connection.errorMessage)
    let identity: Awaited<ReturnType<typeof localRuntimeIdentityProvision>>
    let target: Awaited<ReturnType<typeof cliLocalTargetProvision>>
    let closed: Awaited<ReturnType<typeof databaseConnectionClose>>
    try {
      identity = await localRuntimeIdentityProvision(connection.data.db)
      if (!identity.success) throw new Error(identity.errorMessage)
      target = await cliLocalTargetProvision(connection.data.db, catalog.data, environment)
      if (!target.success) throw new Error(target.errorMessage)
    } finally {
      closed = await databaseConnectionClose(connection.data)
    }
    if (!closed.success) throw new Error(closed.errorMessage)
    if (target.data.agentId !== undefined) {
      const configured = await configurationStoreTargetReconcile(
        store.data,
        { serverId: target.data.serverId, agentId: target.data.agentId },
        target.data.configuration,
      )
      if (!configured.success) throw new Error(configured.errorMessage)
    }
    runtime = await serverRuntimeCreate({
      local: { configuration: { databaseUrl, nodeEnv: "production" }, identity: identity.data },
      databasePath,
      configurationStore: store.data,
      journalCursorCodec: codec.data,
      projectRootDirs: canonicalRoots,
      providerAgentCatalog: catalog.data,
      providerEnvironment: environment,
      appCreate: options.appCreate,
    })
    if (!runtime.success) throw new Error(runtime.errorMessage)
    const composed = runtime.data
    let shutdownPromise: Promise<Result<void>> | undefined
    output = {
      fetch: async (request) => composed.application.fetch(request),
      shutdown: () => {
        if (shutdownPromise !== undefined) return shutdownPromise
        shutdownPromise = (async () => {
          const stopped = await composed.shutdown()
          const released = await lock.data()
          if (!released.success) return released
          return stopped
        })()
        return shutdownPromise
      },
      projectPath: project.data,
      projectRootDirs: canonicalRoots,
      databasePath,
      dataDirectory,
      identity: identity.data,
      target: { serverId: target.data.serverId, agentId: target.data.agentId },
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : "The local runtime could not be initialized."
  }
  if (output !== undefined) return createResult(output)
  if (runtime?.success) await runtime.data.shutdown()
  const released = await lock.data()
  if (!released.success) return createResultError(op, released.errorMessage)
  return createResultError(op, failure ?? "The local runtime could not be initialized.")
}
