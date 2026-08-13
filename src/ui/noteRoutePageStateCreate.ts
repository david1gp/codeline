import { useParams } from "@solidjs/router"

export function noteRoutePageStateCreate() {
  const params = useParams<{ noteId: string }>()
  return { noteId: () => params.noteId }
}
