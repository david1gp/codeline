import * as v from "valibot"

export const sessionSidebarTabSchema = v.picklist(["recent", "watched", "projects", "search"])

export type SessionSidebarTab = v.InferOutput<typeof sessionSidebarTabSchema>
