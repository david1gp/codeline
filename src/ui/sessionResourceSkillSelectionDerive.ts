type SessionResourceSkillOverride = {
  disabledSkills: readonly string[]
  enabledSkills: readonly string[]
}

type SessionResourceSkillSelectionDeriveInput = {
  /** Pending per-skill changes made in this pre-session workspace, relative to `loadedOverride`. */
  delta: SessionResourceSkillOverride
  /** The override the server already applied when it resolved `serverActiveSkillNames`. */
  loadedOverride: SessionResourceSkillOverride
  /** Preset exclusions always win, so they can never be re-enabled from the UI. */
  presetExcludeSkillNames: readonly string[]
  /** Effective skill names the server resolved for the selected preset and stored override. */
  serverActiveSkillNames: readonly string[]
}

type SessionResourceSkillSelectionDerived = {
  activeSkillNames: readonly string[]
  requestOverride: { disabledSkills: readonly string[]; enabledSkills: readonly string[] }
}

function sessionResourceSkillNamesSort(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

/**
 * Mirrors the server's skill selection precedence for the pre-session workspace:
 * the preset is resolved server-side, individual overrides are layered on top, and
 * preset exclusions always win. The returned request override is expressed against
 * the preset alone, so submitting it reproduces exactly the previewed active list.
 */
export function sessionResourceSkillSelectionDerive(
  input: SessionResourceSkillSelectionDeriveInput,
): SessionResourceSkillSelectionDerived {
  const excluded = new Set(input.presetExcludeSkillNames)
  const deltaEnabled = new Set(input.delta.enabledSkills)
  const deltaDisabled = new Set(input.delta.disabledSkills)

  const active = new Set(input.serverActiveSkillNames)
  for (const name of deltaEnabled) active.add(name)
  for (const name of deltaDisabled) active.delete(name)
  for (const name of excluded) active.delete(name)

  const enabledSkills = new Set(input.loadedOverride.enabledSkills)
  for (const name of deltaEnabled) enabledSkills.add(name)
  for (const name of deltaDisabled) enabledSkills.delete(name)

  const disabledSkills = new Set(input.loadedOverride.disabledSkills)
  for (const name of deltaDisabled) disabledSkills.add(name)
  for (const name of deltaEnabled) disabledSkills.delete(name)

  return {
    activeSkillNames: sessionResourceSkillNamesSort(active),
    requestOverride: {
      disabledSkills: sessionResourceSkillNamesSort(disabledSkills),
      enabledSkills: sessionResourceSkillNamesSort(enabledSkills),
    },
  }
}
