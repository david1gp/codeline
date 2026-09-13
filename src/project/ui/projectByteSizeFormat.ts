const byteUnits = ["B", "kB", "MB", "GB", "TB"] as const

export function projectByteSizeFormat(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "Unknown size"
  if (size < 1000) return `${size} B`

  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1000)), byteUnits.length - 1)
  const value = size / 1000 ** unitIndex
  const digits = value < 10 ? 1 : 0
  return `${value.toFixed(digits)} ${byteUnits[unitIndex]}`
}
