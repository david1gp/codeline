import type { BadgeVariant } from "#ui/static/badge/badgeCva.jsx"
import type { HttpQueryDataStatus } from "../../ui/httpQueryDataStatusResolve.js"

type NoteDataStatusNotice = {
  label: string
  variant: BadgeVariant
}

/** Wording for the retained-data lifecycle of a note representation. `ready` renders nothing. */
export function noteDataStatusNoticeResolve(status: HttpQueryDataStatus): NoteDataStatusNotice | undefined {
  if (status === "offline") return { label: "Offline — showing the last loaded notes.", variant: "subtle" }
  if (status === "reconciling") return { label: "Reconciling…", variant: "subtle" }
  if (status === "stale")
    return { label: "Stale — the last loaded notes could not be revalidated.", variant: "outline" }
  return undefined
}
