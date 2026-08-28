import * as path from "node:path"
import * as v from "valibot"
import { agentInstructionDiscoveryLimits } from "../../instructions/agentInstructionDiscoveryLimits.js"

const sessionInstructionOverridePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)
const sessionInstructionOverrideContentSchema = v.pipe(
  v.string(),
  v.check((value) => Buffer.byteLength(value, "utf8") <= agentInstructionDiscoveryLimits.maximumFileBytes),
)

export const sessionInstructionOverridesSchema = v.pipe(
  v.record(sessionInstructionOverridePathSchema, sessionInstructionOverrideContentSchema),
  v.check((overrides) => Object.keys(overrides).length <= agentInstructionDiscoveryLimits.maximumSnapshots),
)

export type SessionInstructionOverrides = v.InferOutput<typeof sessionInstructionOverridesSchema>
