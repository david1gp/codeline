import { readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

const packageName = "@rocicorp/zero"
const registryUrl = "https://registry.npmjs.org/@rocicorp%2fzero"
const root = dirname(dirname(new URL(import.meta.url).pathname))
const packagePath = join(root, "package.json")
const lockPath = join(root, "bun.lock")

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isExactVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      value,
    )
  )
}

async function headVersionResolve(): Promise<string> {
  const response = await fetch(registryUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`npm registry request failed: ${response.status} ${response.statusText}`)

  const metadata: unknown = await response.json()
  if (!isRecord(metadata)) throw new Error("npm registry response is not an object")
  const distTags = metadata["dist-tags"]
  if (!isRecord(distTags) || !isExactVersion(distTags.head)) {
    throw new Error("npm registry response does not contain an exact @rocicorp/zero head version")
  }

  const versions = metadata.versions
  if (!isRecord(versions) || !isRecord(versions[distTags.head])) {
    throw new Error(`npm registry response does not contain package version ${distTags.head}`)
  }
  const versionMetadata = versions[distTags.head]
  if (!isRecord(versionMetadata)) throw new Error(`npm registry metadata is invalid for ${distTags.head}`)
  if (versionMetadata.version !== distTags.head) {
    throw new Error(`npm registry package metadata version mismatch for ${distTags.head}`)
  }
  return distTags.head
}

async function install(): Promise<void> {
  const childProcess = Bun.spawn([process.execPath, "install"], {
    cwd: root,
    stderr: "inherit",
    stdout: "inherit",
  })
  const exitCode = await childProcess.exited
  if (exitCode !== 0) throw new Error(`bun install failed with exit code ${exitCode}`)
}

async function run(): Promise<void> {
  const [packageContents, previousLock] = await Promise.all([
    readFile(packagePath, "utf8"),
    readFile(lockPath, "utf8").catch(() => undefined),
  ])
  const packageJson: unknown = JSON.parse(packageContents)
  if (!isRecord(packageJson)) throw new Error("package.json is not an object")
  const dependencies = packageJson.dependencies
  if (!isRecord(dependencies) || typeof dependencies[packageName] !== "string") {
    throw new Error(`package.json does not declare ${packageName} in dependencies`)
  }

  const headVersion = await headVersionResolve()
  if (dependencies[packageName] === headVersion) {
    console.log(`${packageName} is already pinned to ${headVersion}; skipped bun install`)
    return
  }

  dependencies[packageName] = headVersion
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  try {
    await install()
  } catch (error) {
    await writeFile(packagePath, packageContents)
    if (previousLock === undefined) await unlink(lockPath).catch(() => undefined)
    else await writeFile(lockPath, previousLock)
    throw error
  }
  console.log(`${packageName} updated to ${headVersion}`)
}

try {
  await run()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`zero-head-update: ${message}`)
  process.exit(1)
}
