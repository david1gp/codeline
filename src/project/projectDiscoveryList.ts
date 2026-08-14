import { createResult, type Result } from "@adaptive-ds/result"
import {
  type ProjectDiscoveryEntriesReadOptions,
  type ProjectDiscoveryEntry,
  type ProjectDiscoveryEntriesReadResult,
  projectDiscoveryEntriesRead,
} from "./projectDiscoveryEntriesRead.js"
import { projectDiscoveryLimits } from "./projectDiscoveryLimits.js"

export type ProjectDiscoveryListOptions = ProjectDiscoveryEntriesReadOptions & {
  discovered?: ProjectDiscoveryEntriesReadResult
}

export type ProjectSelection = {
  id: string
  label: string
}

function projectLabelTruncate(value: string, maximumLength: number): string {
  let result = ""
  for (const character of value) {
    if (result.length + character.length > maximumLength) break
    result += character
  }
  return result
}

function projectLabelKey(label: string): string {
  return label.toLowerCase()
}

function projectLabelSort(left: ProjectSelection, right: ProjectSelection): number {
  const leftKey = projectLabelKey(left.label)
  const rightKey = projectLabelKey(right.label)
  if (leftKey < rightKey) return -1
  if (leftKey > rightKey) return 1
  if (left.label < right.label) return -1
  if (left.label > right.label) return 1
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

function projectLabelCreate(name: string, suffix?: number): string {
  if (suffix === undefined) return projectLabelTruncate(name, projectDiscoveryLimits.maximumLabelLength)

  const suffixText = ` (${suffix})`
  const maximumNameLength = projectDiscoveryLimits.maximumLabelLength - suffixText.length
  return `${projectLabelTruncate(name, maximumNameLength)}${suffixText}`
}

export async function projectDiscoveryList(
  rootDirs: readonly string[],
  options: ProjectDiscoveryListOptions = {},
): Promise<Result<{ projects: ProjectSelection[]; truncated: boolean }>> {
  const { discovered: cached, ...readOptions } = options
  const discovered =
    cached === undefined ? await projectDiscoveryEntriesRead(rootDirs, readOptions) : createResult(cached)
  if (!discovered.success) return discovered

  const groups = new Map<string, ProjectDiscoveryEntry[]>()
  for (const entry of discovered.data.entries) {
    const key = projectLabelKey(entry.name)
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, [entry])
      continue
    }
    group.push(entry)
  }

  const labels = new Map<string, string>()
  for (const group of groups.values()) {
    group.sort((left, right) =>
      left.canonicalPath < right.canonicalPath ? -1 : left.canonicalPath > right.canonicalPath ? 1 : 0,
    )
    for (let index = 0; index < group.length; index += 1) {
      const entry = group[index]
      if (entry === undefined) continue
      labels.set(entry.canonicalPath, projectLabelCreate(entry.name, group.length === 1 ? undefined : index + 1))
    }
  }

  const usedLabels = new Set<string>()
  const projects: ProjectSelection[] = []
  for (const entry of discovered.data.entries) {
    const initialLabel = labels.get(entry.canonicalPath) ?? projectLabelCreate(entry.name)
    let label = initialLabel
    let suffix = 2
    while (usedLabels.has(projectLabelKey(label))) {
      label = projectLabelCreate(initialLabel, suffix)
      suffix += 1
    }
    usedLabels.add(projectLabelKey(label))
    projects.push({ id: entry.id, label })
  }

  projects.sort(projectLabelSort)
  return createResult({ projects, truncated: discovered.data.truncated })
}
