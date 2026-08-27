import * as v from "valibot"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"

export const skillToolOutputSchema = v.strictObject({
  directory: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  output: v.pipe(v.string(), v.maxLength(skillDiscoveryLimits.maximumTotalBytes)),
})

export type SkillToolOutput = v.InferOutput<typeof skillToolOutputSchema>
