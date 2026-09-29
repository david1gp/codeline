import * as v from "valibot"

export const sessionSidebarNewModeSchema = v.picklist(["flat", "projects"])

export type SessionSidebarNewMode = v.InferOutput<typeof sessionSidebarNewModeSchema>
