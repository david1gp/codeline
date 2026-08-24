import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { releaseInputsVerify } from "../src/release/releaseInputsVerify.js"

type CommandResult = { exitCode: number; stderr: string; stdout: string }

async function gitRun(rootDir: string, args: readonly string[]): Promise<CommandResult> {
  const process = Bun.spawn(["git", "-C", rootDir, ...args], { stderr: "pipe", stdout: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  return { exitCode, stderr, stdout }
}

async function gitAssert(rootDir: string, args: readonly string[]): Promise<void> {
  const result = await gitRun(rootDir, args)
  if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout)
}

interface ReleaseInputFixture {
  checkout: string
  manifest: {
    inputs: {
      gitStore: {
        buildExports: Record<string, unknown>
        checkout: { defaultPath: string; environmentVariable: string }
        label: string
        packageName: string
        packagePath: string
        packageVersion: string
        requiredBuiltOutputs: string[]
        sourceRevision: string | null
      }
    }
    schemaVersion: number
  }
  rootDir: string
}

async function releaseInputFixtureCreate(): Promise<ReleaseInputFixture> {
  const rootDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "codeline-release-inputs-")))
  const checkout = path.join(rootDir, "git-store")
  await fs.mkdir(path.join(checkout, "dist"), { recursive: true })
  await fs.writeFile(
    path.join(checkout, "package.json"),
    JSON.stringify({
      name: "@adaptive-ds/git-store",
      version: "0.1.0",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          default: "./dist/index.js",
        },
      },
    }),
  )
  await fs.writeFile(path.join(checkout, ".gitignore"), "dist/\n")
  await fs.writeFile(path.join(checkout, "dist/index.js"), "export const fixture = true\n")
  await fs.writeFile(path.join(checkout, "dist/index.d.ts"), "export declare const fixture: boolean\n")
  await gitAssert(checkout, ["init", "--initial-branch=main"])
  await gitAssert(checkout, ["config", "user.email", "codeline-test@example.test"])
  await gitAssert(checkout, ["config", "user.name", "Codeline Test"])
  await gitAssert(checkout, ["add", "."])
  await gitAssert(checkout, ["commit", "-m", "fixture"])
  const revisionResult = await gitRun(checkout, ["rev-parse", "HEAD"])
  if (revisionResult.exitCode !== 0) throw new Error(revisionResult.stderr)

  await fs.mkdir(path.join(rootDir, "node_modules/@adaptive-ds"), { recursive: true })
  await fs.symlink(checkout, path.join(rootDir, "node_modules/@adaptive-ds/git-store"))

  return {
    rootDir,
    checkout,
    manifest: {
      schemaVersion: 1,
      inputs: {
        gitStore: {
          label: "git-store fixture",
          checkout: { environmentVariable: "GIT_STORE_CHECKOUT", defaultPath: checkout },
          packagePath: ".",
          packageName: "@adaptive-ds/git-store",
          packageVersion: "0.1.0",
          sourceRevision: revisionResult.stdout.trim(),
          buildExports: {
            ".": {
              types: "./dist/index.d.ts",
              default: "./dist/index.js",
            },
          },
          requiredBuiltOutputs: ["dist/index.d.ts", "dist/index.js"],
        },
      },
    },
  }
}

async function releaseInputFixtureVerify(fixture: ReleaseInputFixture) {
  await fs.writeFile(path.join(fixture.rootDir, "release-inputs.json"), JSON.stringify(fixture.manifest))
  return releaseInputsVerify({
    root: fixture.rootDir,
    inputNames: ["gitStore"],
    checkoutPaths: { gitStore: fixture.checkout },
  })
}

function resultErrorMessage(result: Awaited<ReturnType<typeof releaseInputsVerify>>): string {
  return result.success ? "" : result.errorMessage
}

describe("release input provenance verification", () => {
  let fixture: ReleaseInputFixture

  beforeEach(async () => {
    fixture = await releaseInputFixtureCreate()
  })

  afterEach(async () => {
    await fs.rm(fixture.rootDir, { force: true, recursive: true })
  })

  test("accepts the pinned fixture and package command", async () => {
    const result = await releaseInputFixtureVerify(fixture)
    expect(result.success).toBe(true)

    const childProcess = Bun.spawn(
      ["bun", "run", "release:inputs:verify", "--", "--root", fixture.rootDir, "--input", "git-store"],
      { cwd: process.cwd(), stderr: "pipe", stdout: "pipe" },
    )
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(childProcess.stdout).text(),
      new Response(childProcess.stderr).text(),
      childProcess.exited,
    ])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("verified git-store fixture")
    expect(stderr).toContain("$ bun scripts/releaseInputsVerify.ts")
  })

  test("resolves a relative default checkout from the verification root", async () => {
    fixture.manifest.inputs.gitStore.checkout.defaultPath = "git-store"
    await fs.writeFile(path.join(fixture.rootDir, "release-inputs.json"), JSON.stringify(fixture.manifest))
    const result = await releaseInputsVerify({ root: fixture.rootDir, inputNames: ["gitStore"] })
    expect(result.success).toBe(true)
  })

  test("rejects a package version mismatch", async () => {
    fixture.manifest.inputs.gitStore.packageVersion = "0.0.0"
    const result = await releaseInputFixtureVerify(fixture)
    expect(resultErrorMessage(result)).toContain("package version")
  })

  test("rejects a commit mismatch", async () => {
    fixture.manifest.inputs.gitStore.sourceRevision = "0".repeat(40)
    const result = await releaseInputFixtureVerify(fixture)
    expect(resultErrorMessage(result)).toContain("pinned commit")
  })

  test("rejects a dirty checkout", async () => {
    await fs.writeFile(path.join(fixture.checkout, "dirty.txt"), "dirty\n")
    const result = await releaseInputFixtureVerify(fixture)
    expect(resultErrorMessage(result)).toContain("checkout is dirty")
  })

  test("rejects a source directory without Git metadata", async () => {
    await fs.rm(path.join(fixture.checkout, ".git"), { force: true, recursive: true })
    const result = await releaseInputFixtureVerify(fixture)
    expect(resultErrorMessage(result)).toContain("not a Git checkout")
  })

  test("rejects a link to the wrong package path", async () => {
    const wrongPackage = path.join(fixture.checkout, "wrong-package")
    await fs.mkdir(wrongPackage)
    await fs.rm(path.join(fixture.rootDir, "node_modules/@adaptive-ds/git-store"))
    await fs.symlink(wrongPackage, path.join(fixture.rootDir, "node_modules/@adaptive-ds/git-store"))
    const result = await releaseInputFixtureVerify(fixture)
    expect(resultErrorMessage(result)).toContain("link resolves to")
  })

  test("rejects a missing build output", async () => {
    await fs.rm(path.join(fixture.checkout, "dist/index.js"))
    const result = await releaseInputFixtureVerify(fixture)
    expect(resultErrorMessage(result)).toContain("required build output is missing")
  })
})
