import * as v from "valibot"
import { codelineExecutionSchema } from "../../providers/schema/codelineExecutionSchema.js"

const sessionChatMessageSchema = v.object({
  content: v.optional(v.union([v.pipe(v.string(), v.maxLength(100_000)), v.array(v.unknown())])),
  id: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  role: v.picklist(["assistant", "developer", "system", "tool", "user", "activity", "reasoning"]),
})

const sessionChatForwardedPropsSchema = v.intersect([
  v.record(v.string(), v.unknown()),
  v.object({ codelineExecution: v.optional(codelineExecutionSchema) }),
])

export const sessionChatRequestSchema = v.object({
  context: v.optional(v.array(v.unknown()), []),
  forwardedProps: v.optional(sessionChatForwardedPropsSchema),
  messages: v.pipe(v.array(sessionChatMessageSchema), v.minLength(1), v.maxLength(1_000)),
  parentRunId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  resume: v.optional(v.array(v.unknown())),
  runId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  state: v.optional(v.unknown()),
  threadId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  tools: v.optional(v.array(v.unknown()), []),
})

export type SessionChatRequest = v.InferOutput<typeof sessionChatRequestSchema>
