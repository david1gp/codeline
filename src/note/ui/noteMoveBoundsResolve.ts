export function noteMoveBoundsResolve(notes: readonly { id: string }[], noteId: string) {
  const index = notes.findIndex((note) => note.id === noteId)
  if (index < 0) return { index, canMoveUp: false, canMoveDown: false }
  return { index, canMoveUp: index > 0, canMoveDown: index < notes.length - 1 }
}
