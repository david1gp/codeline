import * as v from "valibot"

const codelineExecutionSchema = v.strictObject({
  model: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  provider: v.picklist(["cliproxyapi", "codex-lb", "deterministic"]),
})

export { codelineExecutionSchema }
export type CodelineExecution = v.InferOutput<typeof codelineExecutionSchema>
