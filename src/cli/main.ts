#!/usr/bin/env bun
import { run } from "@stricli/core"
import { cliApplicationCreate } from "./cliApplicationCreate.js"
import { cliConfigPathResolve } from "./cliConfigPathResolve.js"

const application = cliApplicationCreate()
await run(application, process.argv.slice(2), {
  process,
  configPath: cliConfigPathResolve(),
  env: process.env,
  onInterrupt: (handler) => {
    process.on("SIGINT", handler)
    return () => process.off("SIGINT", handler)
  },
  onTerminate: (handler) => {
    process.on("SIGTERM", handler)
    return () => process.off("SIGTERM", handler)
  },
})
