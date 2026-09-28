import { buildApplication, buildCommand, buildRouteMap, help } from "@stricli/core"
import type { CliCommandContext } from "./cliCommandContext.js"
import { type CliFlags, cliCommandOptions } from "./cliCommandOptions.js"
import { cliCommandRun } from "./cliCommandRun.js"

export function cliApplicationCreate() {
  const interactive = buildCommand<CliFlags, [], CliCommandContext>({
    parameters: cliCommandOptions,
    docs: { brief: "Start an interactive Codeline conversation" },
    func: function (flags) {
      return cliCommandRun(this, flags, "interactive")
    },
  })
  const run = buildCommand<CliFlags, [string], CliCommandContext>({
    parameters: {
      ...cliCommandOptions,
      positional: {
        kind: "tuple",
        parameters: [{ parse: (prompt) => prompt, brief: "prompt to send", placeholder: "prompt" }],
      },
    },
    docs: { brief: "Send one prompt to Codeline" },
    func: function (flags, prompt) {
      return cliCommandRun(this, flags, "run", prompt)
    },
  })
  const root = buildRouteMap({
    routes: { chat: interactive, run },
    defaultCommand: "chat",
    docs: { brief: "Codeline command-line interface" },
  })
  return buildApplication(
    root,
    {
      name: "codeline",
      scanner: { caseStyle: "allow-kebab-for-camel" },
    },
    {
      help: help({
        brief: "Print help information and exit",
        formatting: { useAliasInUsageLine: false, onlyRequiredInUsageLine: false, caseStyle: "convert-camel-to-kebab" },
      }),
    },
  )
}
