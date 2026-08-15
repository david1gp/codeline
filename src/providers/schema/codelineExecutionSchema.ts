import * as v from "valibot"

const codelineExecutionSchema = v.strictObject({
  agentId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  model: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  provider: v.picklist(["cliproxyapi", "codex-lb", "deterministic"]),
  reasoningEffort: v.optional(v.picklist(["low", "medium", "high", "xhigh", "max"])),
})

export { codelineExecutionSchema }
export type CodelineExecution = v.InferOutput<typeof codelineExecutionSchema>
