type ApiQueryValue = boolean | null | number | string | undefined
type ApiQuery = Readonly<Record<string, ApiQueryValue | readonly ApiQueryValue[]>> | URLSearchParams

const apiQueryKeyOrigin = "https://api.invalid"

function apiQueryKeyEntriesCreate(query: ApiQuery | undefined): Array<[string, string]> {
  if (query === undefined) return []
  if (query instanceof URLSearchParams) return Array.from(query.entries())

  const entries: Array<[string, string]> = []
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      if (item !== undefined && item !== null) entries.push([key, String(item)])
    }
  }
  return entries
}

export function apiQueryKeyCreate(path: string, query?: ApiQuery): string {
  const url = new URL(path, apiQueryKeyOrigin)
  const entries = [...url.searchParams.entries(), ...apiQueryKeyEntriesCreate(query)]
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  const search = new URLSearchParams(entries).toString()
  return search.length === 0 ? url.pathname : `${url.pathname}?${search}`
}
