import { describe, expect, test } from "bun:test"
import { homedir } from "node:os"
import { join } from "node:path"
import { cliConfigPathResolve } from "./cliConfigPathResolve.js"

describe("cliConfigPathResolve", () => {
  test("uses XDG_CONFIG_HOME when set", () => {
    expect(cliConfigPathResolve({ XDG_CONFIG_HOME: "/tmp/user-config" })).toBe("/tmp/user-config/codeline/config.json")
  })

  test("uses HOME config directory when XDG_CONFIG_HOME is unset", () => {
    expect(cliConfigPathResolve({ HOME: "/home/example" })).toBe("/home/example/.config/codeline/config.json")
  })

  test.each(["relative/config", ""])("ignores non-absolute XDG_CONFIG_HOME value %j", (xdgConfigHome) => {
    expect(cliConfigPathResolve({ HOME: "/home/example", XDG_CONFIG_HOME: xdgConfigHome })).toBe(
      "/home/example/.config/codeline/config.json",
    )
  })

  test("ignores a relative HOME so configuration cannot follow a selected working directory", () => {
    expect(cliConfigPathResolve({ HOME: "relative-home", XDG_CONFIG_HOME: "relative-config" })).toBe(
      join(homedir(), ".config", "codeline", "config.json"),
    )
  })
})
