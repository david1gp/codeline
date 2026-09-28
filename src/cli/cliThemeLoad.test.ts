import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliThemeLoad } from "./cliThemeLoad.js"

const requiredColors = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "selectedBg",
  "userMessageBg",
  "userMessageText",
  "customMessageBg",
  "customMessageText",
  "customMessageLabel",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "bashMode",
]

function validTheme(): {
  name: string
  appearance: string
  vars: Record<string, string | number>
  colors: Record<string, string | number>
  export: Record<string, string | number>
} {
  return {
    name: "fixture",
    appearance: "light",
    vars: { primary: "#123456", secondary: "primary" },
    colors: Object.fromEntries(requiredColors.map((name) => [name, "secondary"])),
    export: { pageBg: "primary" },
  }
}

describe("cliThemeLoad", () => {
  test("loads Pi themes from the XDG Codeline directory and resolves variables and optional color fallbacks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codeline-theme-"))
    try {
      const themes = join(directory, "codeline", "themes")
      await mkdir(themes, { recursive: true })
      await writeFile(join(themes, "fixture.json"), JSON.stringify(validTheme()))
      const result = await cliThemeLoad("fixture", { XDG_CONFIG_HOME: directory, HOME: directory })
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.theme.appearance).toBe("light")
      expect(result.data.colors.accent).toBe("#123456")
      expect(result.data.colors.scrollbarTrack).toBe("#123456")
      expect(result.data.colors.searchMatchBg).toBe("#123456")
      expect(result.data.export).toEqual({ pageBg: "#123456" })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("loads an explicitly selected Pi theme file and reports invalid variable references", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codeline-theme-file-"))
    try {
      const path = join(directory, "theme.json")
      await writeFile(path, JSON.stringify(validTheme()))
      expect((await cliThemeLoad(path)).success).toBe(true)
      const invalid = validTheme()
      invalid.colors.accent = "missing-variable"
      await writeFile(path, JSON.stringify(invalid))
      expect((await cliThemeLoad(path)).success).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("resolves Pi-style variable chains and preserves ANSI indexes and default color", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codeline-theme-pi-format-"))
    try {
      const theme = validTheme()
      theme.vars = { primary: "#123456", secondary: "primary" }
      theme.colors.accent = "secondary"
      theme.colors.border = 0
      theme.colors.borderAccent = 255
      theme.colors.borderMuted = "default"
      const path = join(directory, "pi-theme.json")
      await writeFile(path, JSON.stringify(theme))
      const result = await cliThemeLoad(path)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.colors.accent).toBe("#123456")
      expect(result.data.colors.border).toBe(0)
      expect(result.data.colors.borderAccent).toBe(255)
      expect(result.data.colors.borderMuted).toBe("default")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects cyclic variable references and themes missing required color tokens", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codeline-theme-invalid-"))
    try {
      const path = join(directory, "theme.json")
      const cyclic = validTheme()
      cyclic.vars = { primary: "secondary", secondary: "primary" }
      cyclic.colors.accent = "primary"
      await writeFile(path, JSON.stringify(cyclic))
      expect((await cliThemeLoad(path)).success).toBe(false)

      const missingToken = validTheme()
      delete (missingToken.colors as Partial<typeof missingToken.colors>).bashMode
      await writeFile(path, JSON.stringify(missingToken))
      expect((await cliThemeLoad(path)).success).toBe(false)

      const invalidIndex = validTheme()
      invalidIndex.colors.accent = 256
      await writeFile(path, JSON.stringify(invalidIndex))
      expect((await cliThemeLoad(path)).success).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("treats slash-containing selections as explicit paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codeline-theme-relative-"))
    try {
      const path = join(directory, "nested", "theme.json")
      await mkdir(join(directory, "nested"), { recursive: true })
      await writeFile(path, JSON.stringify(validTheme()))
      const previousDirectory = process.cwd()
      process.chdir(directory)
      try {
        const result = await cliThemeLoad("nested/theme.json")
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.sourcePath).toBe(path)
      } finally {
        process.chdir(previousDirectory)
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
