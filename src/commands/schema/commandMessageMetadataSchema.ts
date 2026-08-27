import * as v from "valibot"
import { codelineExecutionSchema } from "../../providers/schema/codelineExecutionSchema.js"
import { commandDigestSchema } from "./commandDigestSchema.js"
import { commandExecutionOverrideSchema } from "./commandExecutionOverrideSchema.js"
import { commandNameSchema } from "./commandNameSchema.js"

export const commandMessageMetadataSchema = v.strictObject({
  command: v.strictObject({
    argumentsText: v.pipe(v.string(), v.maxLength(100_000)),
    catalogDigest: commandDigestSchema,
    execution: v.optional(codelineExecutionSchema),
    expandedUserText: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100_000)),
    name: commandNameSchema,
    overrides: commandExecutionOverrideSchema,
    templateDigest: commandDigestSchema,
    version: v.literal(1),
  }),
})

export type CommandMessageMetadata = v.InferOutput<typeof commandMessageMetadataSchema>
