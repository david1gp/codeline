import type { TypedCommandFlagParameters } from "@stricli/core"
import type { CliCommandContext } from "./cliCommandContext.js"

export type CliFlags = {
  backend?: string
  session?: string
  project?: string
  theme?: string
}

export const cliCommandOptions: TypedCommandFlagParameters<CliFlags, CliCommandContext> = {
  flags: {
    backend: { kind: "parsed", parse: (input) => input, brief: "local or a Codeline server URL", optional: true },
    session: { kind: "parsed", parse: (input) => input, brief: "session identifier", optional: true },
    project: { kind: "parsed", parse: (input) => input, brief: "project identifier", optional: true },
    theme: { kind: "parsed", parse: (input) => input, brief: "terminal theme name or path", optional: true },
  },
}
