function toolResultJsonParse(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return undefined
  }
}

function toolResultWorkingDirectoryResolveAtDepth(input: unknown, depth: number): string | undefined {
  const candidate = typeof input === "string" ? toolResultJsonParse(input) : input
  if (depth > 3) return undefined
  if (Array.isArray(candidate)) {
    for (const part of candidate) {
      const workingDirectory = toolResultWorkingDirectoryResolveAtDepth(part, depth + 1)
      if (workingDirectory !== undefined) return workingDirectory
    }
    return undefined
  }
  if (candidate === null || typeof candidate !== "object") return undefined

  const workingDirectory = (candidate as Record<string, unknown>).workingDirectory
  if (typeof workingDirectory !== "string" || workingDirectory.length === 0 || workingDirectory.length > 4_096)
    return undefined
  return workingDirectory
}

export function toolResultWorkingDirectoryResolve(input: unknown): string | undefined {
  return toolResultWorkingDirectoryResolveAtDepth(input, 0)
}
