import * as v from "valibot"
import { runtimeConfigurationSchema } from "./runtimeConfigurationSchema.js"

// Code-injected in-process configuration, never an AUTH_MODE or environment parser.
// Network authentication fields are deliberately not accepted.
export const localRuntimeConfigurationSchema = v.strictObject(
  v.pick(runtimeConfigurationSchema, ["databaseUrl", "nodeEnv", "openCodeDatabasePath", "sessionsSidebarPageSize"])
    .entries,
)

export type LocalRuntimeConfiguration = v.InferInput<typeof localRuntimeConfigurationSchema>
