import * as v from "valibot"

export const toolNameSchema = v.picklist(["bash", "webfetch", "skill", "delegate_task"])

export type ToolName = v.InferOutput<typeof toolNameSchema>
