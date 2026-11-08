/**
 * Referentially stable projection of a freshly derived list, so a Solid `<For>`
 * keeps the rows whose content did not change. The previous list is matched by a
 * stable key; an item whose previous entry compares equal is reused by reference,
 * and every other item (changed, added, or reordered) is taken from the fresh
 * list. Removed keys are pruned by construction.
 */
export function stableListReuse<T>(
  previous: readonly T[],
  next: readonly T[],
  keyOf: (item: T) => string,
  isEqual: (left: T, right: T) => boolean,
): readonly T[] {
  if (previous.length === 0) return next
  const previousByKey = new Map<string, T>()
  for (const item of previous) previousByKey.set(keyOf(item), item)
  return next.map((item) => {
    const prev = previousByKey.get(keyOf(item))
    if (prev !== undefined && isEqual(prev, item)) return prev
    return item
  })
}
