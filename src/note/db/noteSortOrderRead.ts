export function noteSortOrderRead(sortOrder: number | null | undefined): number | undefined {
  return typeof sortOrder === "number" && Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : undefined
}
