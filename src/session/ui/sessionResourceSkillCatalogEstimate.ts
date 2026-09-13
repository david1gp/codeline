type SessionResourceSkillCatalogEntry = {
  bundlePath: string
  description: string
  name: string
}

type SessionResourceSkillCatalogEstimated = {
  characterCount: number
  content: string
  estimatedTokens: number
}

function sessionResourceSkillCatalogEntrySort(
  left: SessionResourceSkillCatalogEntry,
  right: SessionResourceSkillCatalogEntry,
): number {
  if (left.name < right.name) return -1
  if (left.name > right.name) return 1
  if (left.bundlePath < right.bundlePath) return -1
  if (left.bundlePath > right.bundlePath) return 1
  return 0
}

/**
 * Browser-side preview of the active skill description catalog. It reproduces the
 * server rendering and the `ceil(renderedCharacters / 4)` estimate so the workspace
 * can show the cost of a pending selection before the session exists. The value is
 * always an estimate, never a measured token count.
 */
export function sessionResourceSkillCatalogEstimate(
  entries: readonly SessionResourceSkillCatalogEntry[],
): SessionResourceSkillCatalogEstimated {
  const skills = [...entries].sort(sessionResourceSkillCatalogEntrySort)
  const content =
    skills.length === 0
      ? ""
      : [
          "Available skills:",
          ...skills.flatMap(({ bundlePath, description, name }) => [
            `- ${name}: ${description}`,
            `  location: ${bundlePath}`,
          ]),
        ].join("\n")

  return { characterCount: content.length, content, estimatedTokens: Math.ceil(content.length / 4) }
}
