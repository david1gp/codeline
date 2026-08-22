import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"

const releaseInputSchema = v.object({
  label: v.string(),
  checkout: v.object({
    environmentVariable: v.string(),
    defaultPath: v.string(),
  }),
  packagePath: v.string(),
  packageName: v.string(),
  packageVersion: v.string(),
  sourceRevision: v.nullable(v.string()),
  buildExports: v.record(v.string(), v.unknown()),
  requiredBuiltOutputs: v.array(v.string()),
})

const releaseInputManifestSchema = v.object({
  schemaVersion: v.literal(1),
  bun: v.object({ version: v.string() }),
  inputs: v.object({
    zero: v.optional(releaseInputSchema),
    gitStore: releaseInputSchema,
  }),
})

type ReleaseInputName = "zero" | "gitStore"
type ReleaseInput = v.InferOutput<typeof releaseInputSchema>
type ReleaseInputManifest = v.InferOutput<typeof releaseInputManifestSchema>

interface ReleaseInputsVerifyOptions {
  root: string
  manifestPath?: string
  inputNames?: ReleaseInputName[]
  checkoutPaths?: Partial<Record<ReleaseInputName, string>>
  bunVersion?: string
}

interface GitCommandResult {
  exitCode: number
  output: string
}

function gitCommand(checkout: string, args: string[]): GitCommandResult | undefined {
  try {
    const process = Bun.spawnSync(["git", "-C", checkout, ...args], {
      stderr: "ignore",
      stdout: "pipe",
    })
    return {
      exitCode: process.exitCode,
      output: process.stdout.toString().trim(),
    }
  } catch {
    return undefined
  }
}

function pathRealize(path: string): string | undefined {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

function packagePathResolve(packagePath: string, relativePath: string): string | undefined {
  if (relativePath.includes("\0") || relativePath.includes("\\") || relativePath.startsWith("/")) return undefined

  const packageRoot = resolve(packagePath)
  const outputPath = resolve(packageRoot, relativePath)
  const outputRelativePath = relative(packageRoot, outputPath)
  if (outputRelativePath === ".." || outputRelativePath.startsWith("../")) return undefined
  return outputPath
}

function jsonCanonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => jsonCanonicalize(item)).join(",")}]`
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${jsonCanonicalize(item)}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value)
}

function dotenvValueRead(root: string, environmentVariable: string): string | undefined {
  let contents: string
  try {
    contents = readFileSync(join(root, ".env"), "utf8")
  } catch {
    return undefined
  }

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.replace(/\r$/, "")
    const match = line.match(new RegExp(`^\\s*(?:export\\s+)?${environmentVariable}\\s*=(.*)$`))
    if (match === null) continue
    const value = match[1]?.trim() ?? ""
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      return value.slice(1, -1)
    }
    return value
  }
  return undefined
}

function checkoutPathResolve(
  root: string,
  inputName: ReleaseInputName,
  input: ReleaseInput,
  checkoutPaths: Partial<Record<ReleaseInputName, string>>,
): string {
  const checkoutPath =
    checkoutPaths[inputName] ??
    Bun.env[input.checkout.environmentVariable] ??
    dotenvValueRead(root, input.checkout.environmentVariable)
  return checkoutPath ?? resolve(root, input.checkout.defaultPath)
}

function inputLinkPathResolve(root: string, packageName: string): string {
  return join(root, "node_modules", ...packageName.split("/"))
}

function packageJsonRead(packageDirectory: string): Result<{ name: string; version: string; exports: unknown }> {
  const op = "releaseInputsVerify"
  try {
    const packageJson = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")) as unknown
    const parsed = v.safeParse(
      v.object({
        name: v.string(),
        version: v.string(),
        exports: v.unknown(),
      }),
      packageJson,
    )
    if (!parsed.success) return createResultError(op, `Package metadata is invalid: ${packageDirectory}/package.json`)
    return createResult(parsed.output)
  } catch {
    return createResultError(op, `Package metadata is unavailable: ${packageDirectory}/package.json`)
  }
}

function releaseInputVerify(
  root: string,
  inputName: ReleaseInputName,
  input: ReleaseInput,
  options: ReleaseInputsVerifyOptions,
): Result<string> {
  const op = "releaseInputsVerify"
  const checkout = checkoutPathResolve(root, inputName, input, options.checkoutPaths ?? {})
  const checkoutRealPath = pathRealize(checkout)
  if (checkoutRealPath === undefined)
    return createResultError(op, `${input.label} checkout is unavailable: ${checkout}`)

  const linkPath = inputLinkPathResolve(root, input.packageName)
  let linkIsSymbolic = false
  try {
    linkIsSymbolic = lstatSync(linkPath).isSymbolicLink()
  } catch {
    return createResultError(op, `${input.label} link is unavailable: ${linkPath}`)
  }
  if (!linkIsSymbolic) return createResultError(op, `${input.label} link is not a symlink: ${linkPath}`)

  const linkedPackage = pathRealize(linkPath)
  if (linkedPackage === undefined)
    return createResultError(op, `${input.label} link target is unavailable: ${linkPath}`)

  const expectedGitRootCommand = gitCommand(checkoutRealPath, ["rev-parse", "--show-toplevel"])
  if (expectedGitRootCommand?.exitCode !== 0 || expectedGitRootCommand.output.length === 0) {
    return createResultError(op, `${input.label} checkout is not a Git checkout: ${checkoutRealPath}`)
  }
  const expectedGitRoot = pathRealize(expectedGitRootCommand.output)
  if (expectedGitRoot === undefined)
    return createResultError(op, `${input.label} Git checkout root is unavailable: ${checkoutRealPath}`)

  const linkedGitRootCommand = gitCommand(linkedPackage, ["rev-parse", "--show-toplevel"])
  if (linkedGitRootCommand?.exitCode !== 0 || linkedGitRootCommand.output.length === 0) {
    return createResultError(op, `${input.label} linked package is not inside a Git checkout: ${linkedPackage}`)
  }
  const linkedGitRoot = pathRealize(linkedGitRootCommand.output)
  if (linkedGitRoot === undefined)
    return createResultError(op, `${input.label} linked Git checkout root is unavailable: ${linkedPackage}`)
  if (linkedGitRoot !== expectedGitRoot) {
    return createResultError(
      op,
      `${input.label} link resolves to Git checkout ${linkedGitRoot}, expected ${expectedGitRoot}`,
    )
  }

  const expectedPackagePath = packagePathResolve(expectedGitRoot, input.packagePath)
  if (expectedPackagePath === undefined)
    return createResultError(op, `${input.label} package path is invalid in the manifest`)
  const expectedPackageRealPath = pathRealize(expectedPackagePath)
  if (expectedPackageRealPath === undefined)
    return createResultError(op, `${input.label} package path is unavailable: ${expectedPackagePath}`)
  if (linkedPackage !== expectedPackageRealPath) {
    return createResultError(
      op,
      `${input.label} link resolves to ${linkedPackage}, expected ${expectedPackageRealPath}`,
    )
  }

  const statusCommand = gitCommand(expectedGitRoot, ["status", "--porcelain=v1", "--untracked-files=all"])
  if (statusCommand?.exitCode !== 0)
    return createResultError(op, `${input.label} Git status could not be read: ${expectedGitRoot}`)
  if (statusCommand.output.length > 0)
    return createResultError(op, `${input.label} checkout is dirty: ${expectedGitRoot}`)

  if (input.sourceRevision === null)
    return createResultError(op, `${input.label} source revision is not pinned in release-inputs.json`)
  if (!/^[0-9a-f]{40}$/.test(input.sourceRevision))
    return createResultError(op, `${input.label} source revision is not a full Git commit`)
  const revisionCommand = gitCommand(expectedGitRoot, ["rev-parse", "HEAD"])
  if (revisionCommand?.exitCode !== 0 || revisionCommand.output !== input.sourceRevision) {
    return createResultError(op, `${input.label} checkout is not at pinned commit ${input.sourceRevision}`)
  }

  const packageJson = packageJsonRead(linkedPackage)
  if (!packageJson.success) return packageJson
  if (packageJson.data.name !== input.packageName) {
    return createResultError(
      op,
      `${input.label} package name is ${packageJson.data.name}, expected ${input.packageName}`,
    )
  }
  if (packageJson.data.version !== input.packageVersion) {
    return createResultError(
      op,
      `${input.label} package version is ${packageJson.data.version}, expected ${input.packageVersion}`,
    )
  }
  if (jsonCanonicalize(packageJson.data.exports) !== jsonCanonicalize(input.buildExports)) {
    return createResultError(op, `${input.label} package exports do not match release-inputs.json`)
  }

  for (const output of input.requiredBuiltOutputs) {
    const outputPath = packagePathResolve(linkedPackage, output)
    if (outputPath === undefined)
      return createResultError(op, `${input.label} required build output is invalid: ${output}`)
    try {
      if (!statSync(outputPath).isFile())
        return createResultError(op, `${input.label} required build output is missing: ${output}`)
    } catch {
      return createResultError(op, `${input.label} required build output is missing: ${output}`)
    }
  }

  return createResult(input.label)
}

async function releaseInputManifestRead(manifestPath: string): Promise<Result<ReleaseInputManifest>> {
  const op = "releaseInputsVerify"
  try {
    const rawManifest = await Bun.file(manifestPath).json()
    const parsed = v.safeParse(releaseInputManifestSchema, rawManifest)
    if (!parsed.success) return createResultError(op, `Release-input manifest is invalid: ${manifestPath}`)
    return createResult(parsed.output)
  } catch {
    return createResultError(op, `Release-input manifest is unavailable: ${manifestPath}`)
  }
}

export async function releaseInputsVerify(options: ReleaseInputsVerifyOptions): Promise<Result<string[]>> {
  const op = "releaseInputsVerify"
  const root = resolve(options.root)
  const manifest = await releaseInputManifestRead(options.manifestPath ?? join(root, "release-inputs.json"))
  if (!manifest.success) return manifest

  const bunVersion = options.bunVersion ?? Bun.version
  if (bunVersion !== manifest.data.bun.version) {
    return createResultError(op, `Bun version is ${bunVersion}, expected pinned version ${manifest.data.bun.version}`)
  }

  const inputNames = options.inputNames ?? (["gitStore"] satisfies ReleaseInputName[])
  const verifiedInputs: string[] = []
  for (const inputName of inputNames) {
    const input = manifest.data.inputs[inputName]
    if (input === undefined) return createResultError(op, `${inputName} is not declared in release-inputs.json`)
    const result = releaseInputVerify(root, inputName, input, options)
    if (!result.success) return result
    verifiedInputs.push(result.data)
  }
  return createResult(verifiedInputs)
}
