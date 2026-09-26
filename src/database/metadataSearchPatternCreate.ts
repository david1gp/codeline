export function metadataSearchPatternCreate(search: string): string {
  const escaped = search.replace(/[\\%_]/g, (character) => `\\${character}`)
  return `%${escaped}%`
}
