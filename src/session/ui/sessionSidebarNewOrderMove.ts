export function sessionSidebarNewOrderMove(
  visibleIds: readonly string[],
  savedOrder: readonly string[],
  source: string,
  target: string,
): string[] {
  const nextVisible = [...visibleIds]
  const from = nextVisible.indexOf(source)
  const to = nextVisible.indexOf(target)
  if (from < 0 || to < 0 || from === to) return [...savedOrder]

  nextVisible.splice(from, 1)
  nextVisible.splice(to, 0, source)
  const visible = new Set(nextVisible)
  return [...nextVisible, ...savedOrder.filter((id) => !visible.has(id))]
}
