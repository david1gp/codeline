import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"

const pngTargets = [
  { path: "public/logo/codeline-icon-192.png", size: 192, maskable: false },
  { path: "public/logo/codeline-icon-512.png", size: 512, maskable: false },
  { path: "public/logo/codeline-icon-maskable-512.png", size: 512, maskable: true },
] as const

async function magickRun(op: string, args: readonly string[]): Promise<Result<null>> {
  try {
    const process = Bun.spawn(["magick", ...args], { stdout: "pipe", stderr: "pipe" })
    const exitCode = await process.exited
    if (exitCode !== 0) {
      const stderr = await new Response(process.stderr).text()
      return createResultError(op, `magick failed with exit code ${exitCode}: ${stderr.trim()}`, args.join(" "))
    }
    return createResult(null)
  } catch (error) {
    return createResultError(op, `magick could not be started: ${String(error)}`, args.join(" "))
  }
}

/** Generates favicon and PWA icons from the canonical `public/logo.svg` asset. */
export async function logoAssetsGenerate(rootDirectory: string): Promise<Result<null>> {
  const op = "logoAssetsGenerate"

  const logoPath = join(rootDirectory, "public/logo.svg")

  for (const target of pngTargets) {
    const targetPath = join(rootDirectory, target.path)
    try {
      await mkdir(dirname(targetPath), { recursive: true })
    } catch (error) {
      return createResultError(op, `failed to create directory for ${targetPath}: ${String(error)}`)
    }
    const rendered = await magickRun(op, [
      "-background",
      "none",
      "-density",
      "384",
      logoPath,
      "-resize",
      `${target.size}x${target.size}`,
      ...(target.maskable ? ["-background", "#ffffff", "-alpha", "remove", "-alpha", "off"] : []),
      "-colorspace",
      "sRGB",
      "-depth",
      "8",
      "-strip",
      targetPath,
    ])
    if (!rendered.success) return rendered
  }

  const faviconPath = join(rootDirectory, "public/favicon.ico")
  const favicon = await magickRun(op, [
    "-background",
    "none",
    "-density",
    "384",
    logoPath,
    "-colorspace",
    "sRGB",
    "-depth",
    "8",
    "-define",
    "icon:auto-resize=16,32,48",
    "-strip",
    faviconPath,
  ])
  if (!favicon.success) return favicon

  return createResult(null)
}

if (import.meta.main) {
  const result = await logoAssetsGenerate(join(import.meta.dir, ".."))
  if (!result.success) {
    console.error(`${result.op}: ${result.errorMessage}`)
    process.exit(1)
  }
  console.log("logo assets generated")
}
