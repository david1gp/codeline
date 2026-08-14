import { expect, test } from "bun:test"
import * as os from "node:os"
import * as path from "node:path"
import { projectRootConfigurationParse } from "../src/configuration/projectRootConfigurationParse.js"
import { projectDiscoveryLimits } from "../src/project/projectDiscoveryLimits.js"

test("defaults omitted project roots to the home directory", () => {
  expect(projectRootConfigurationParse(undefined)).toEqual({ success: true, data: [path.resolve(os.homedir())] })
})

test("normalizes and deduplicates configured project roots", () => {
  const projectRoot = path.resolve("projects")
  const result = projectRootConfigurationParse(JSON.stringify([" ./projects/../projects ", projectRoot, "projects/"]))

  expect(result).toEqual({ success: true, data: [projectRoot] })
})

test("defaults blank project-root configuration to the home directory", () => {
  const home = { success: true as const, data: [path.resolve(os.homedir())] }
  expect(projectRootConfigurationParse("")).toEqual(home)
  expect(projectRootConfigurationParse("   ")).toEqual(home)
})

test("preserves an explicit empty project-root array", () => {
  expect(projectRootConfigurationParse("[]")).toEqual({ success: true, data: [] })
})

test("rejects malformed and non-array project-root configuration", () => {
  expect(projectRootConfigurationParse("not-json").success).toBe(false)
  expect(projectRootConfigurationParse(JSON.stringify({ roots: ["/tmp"] })).success).toBe(false)
})

test("rejects project-root configuration beyond the bounded root count", () => {
  const roots = Array.from({ length: projectDiscoveryLimits.maximumRoots + 1 }, (_, index) => `/tmp/root-${index}`)
  expect(projectRootConfigurationParse(JSON.stringify(roots)).success).toBe(false)
})
