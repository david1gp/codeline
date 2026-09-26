import * as v from "valibot"

export const sessionDisplayModeSchema = v.picklist(["conversation", "stream"])

export type SessionDisplayMode = v.InferOutput<typeof sessionDisplayModeSchema>
