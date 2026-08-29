import * as v from "valibot"

export const toolNameSchema = v.picklist(["bash", "webfetch", "skill", "delegate_task", "read", "write", "edit"])

export type ToolName = v.InferOutput<typeof toolNameSchema>
