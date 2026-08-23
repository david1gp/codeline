export function agentRepresentationRevisionCreate(representation: string): number {
  let hash = 2_166_136_261
  for (const character of representation) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  return hash >>> 0
}
