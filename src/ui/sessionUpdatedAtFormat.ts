type SessionUpdatedAtValue = Date | number | string

function sessionUpdatedAtMillisecondsResolve(value: SessionUpdatedAtValue): number | null {
  const milliseconds = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value)
  return Number.isFinite(milliseconds) ? milliseconds : null
}

function sessionUpdatedAtRelativeFormat(milliseconds: number, now: number): string {
  const difference = milliseconds - now
  const absoluteDifference = Math.abs(difference)
  const future = difference > 0
  const unitFormat = (unit: string, amount: number) => (future ? `in ${amount}${unit}` : `${amount}${unit} ago`)

  if (absoluteDifference < 60_000) return future ? "in less than a minute" : "just now"
  if (absoluteDifference < 3_600_000) return unitFormat("m", Math.floor(absoluteDifference / 60_000))
  if (absoluteDifference < 86_400_000) return unitFormat("h", Math.floor(absoluteDifference / 3_600_000))
  if (absoluteDifference < 604_800_000) return unitFormat("d", Math.floor(absoluteDifference / 86_400_000))
  if (absoluteDifference < 2_592_000_000) return unitFormat("w", Math.floor(absoluteDifference / 604_800_000))
  if (absoluteDifference < 31_536_000_000) return unitFormat("mo", Math.floor(absoluteDifference / 2_592_000_000))
  return unitFormat("y", Math.floor(absoluteDifference / 31_536_000_000))
}

export function sessionUpdatedAtFormat(value: SessionUpdatedAtValue, now: number = Date.now()) {
  const milliseconds = sessionUpdatedAtMillisecondsResolve(value)
  if (milliseconds === null) return { relative: "Unknown time", title: "Local: Unknown time; UTC: Unknown time" }

  const date = new Date(milliseconds)
  const local = date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  return {
    relative: sessionUpdatedAtRelativeFormat(milliseconds, now),
    title: `Local: ${local}; UTC: ${date.toISOString()}`,
  }
}
