const projectModifiedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

export function projectModifiedAtFormat(modifiedAt: string): string {
  const date = new Date(modifiedAt)
  if (Number.isNaN(date.getTime())) return "Unknown date"
  return projectModifiedAtFormatter.format(date)
}
