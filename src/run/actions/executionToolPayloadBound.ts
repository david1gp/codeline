const executionToolPayloadTailLimitBytes = 8_000
const executionToolPayloadSerializedLimitBytes = 8_192
const executionToolPayloadStringLimit = 4_096
const executionToolPayloadCollectionLimit = 50
const executionToolPayloadDepthLimit = 5
const executionToolPayloadTruncationMarker = "[Earlier output truncated]\n\n"
const executionToolPayloadRootStringLimit =
  executionToolPayloadTailLimitBytes + executionToolPayloadTruncationMarker.length
const executionToolPayloadTextEncoder = new TextEncoder()
const executionToolPayloadTextDecoder = new TextDecoder()
const sensitiveKeyPattern = /(^|[_-])(authorization|cookie|credential|password|secret|token|api[_-]?key)($|[_-])/i

type ExecutionToolValueNormalization = {
  truncated: boolean
  value: unknown
}

type ExecutionToolPayloadBoundMode = "serialized" | "text" | "value"

export type ExecutionToolPayloadBound = {
  content: string
  truncated: boolean
}

function executionToolStringRedact(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|gh[pousr])[-_][A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/(https?:\/\/[^\s/:@]+:)[^\s/@]+@/gi, "$1[REDACTED]@")
}

function executionToolUtf8Tail(value: string, maximumBytes: number): string {
  const bytes = executionToolPayloadTextEncoder.encode(value)
  if (bytes.byteLength <= maximumBytes) return value

  let start = bytes.byteLength - maximumBytes
  while (start < bytes.byteLength && (bytes[start]! & 0xc0) === 0x80) start += 1
  return executionToolPayloadTextDecoder.decode(bytes.slice(start))
}

function executionToolTextBound(value: string): ExecutionToolPayloadBound {
  if (executionToolPayloadTextEncoder.encode(value).byteLength <= executionToolPayloadTailLimitBytes)
    return { content: value, truncated: false }
  return {
    content: `${executionToolPayloadTruncationMarker}${executionToolUtf8Tail(value, executionToolPayloadTailLimitBytes)}`,
    truncated: true,
  }
}

function executionToolValueNormalize(
  input: unknown,
  depth: number,
  seen: Set<object>,
): ExecutionToolValueNormalization {
  if (input === null || typeof input === "boolean") return { truncated: false, value: input }
  if (typeof input === "number") {
    return Number.isFinite(input)
      ? { truncated: false, value: input }
      : { truncated: true, value: "[Unsupported number]" }
  }
  if (typeof input === "string") {
    const redacted = executionToolStringRedact(input)
    const bounded = executionToolTextBound(redacted)
    const stringLimit = depth === 0 ? executionToolPayloadRootStringLimit : executionToolPayloadStringLimit
    if (bounded.content.length <= stringLimit) {
      return { truncated: bounded.truncated, value: bounded.content }
    }
    return {
      truncated: true,
      value: `${executionToolPayloadTruncationMarker}${executionToolUtf8Tail(
        bounded.content,
        stringLimit - executionToolPayloadTruncationMarker.length,
      )}`,
    }
  }
  if (depth >= executionToolPayloadDepthLimit) return { truncated: true, value: "[Truncated]" }
  if (typeof input !== "object" || input === undefined) return { truncated: true, value: "[Unsupported]" }
  if (seen.has(input)) return { truncated: true, value: "[Circular]" }
  seen.add(input)

  if (Array.isArray(input)) {
    let truncated = input.length > executionToolPayloadCollectionLimit
    const value = input.slice(0, executionToolPayloadCollectionLimit).map((entry) => {
      const normalized = executionToolValueNormalize(entry, depth + 1, seen)
      truncated ||= normalized.truncated
      return normalized.value
    })
    seen.delete(input)
    return { truncated, value }
  }

  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) {
    seen.delete(input)
    return { truncated: true, value: "[Unsupported object]" }
  }

  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right))
  let truncated = entries.length > executionToolPayloadCollectionLimit
  const value: Record<string, unknown> = {}
  for (const [rawKey, entry] of entries.slice(0, executionToolPayloadCollectionLimit)) {
    const key = rawKey.slice(0, 128)
    if (key !== rawKey) truncated = true
    if (sensitiveKeyPattern.test(key)) {
      value[key] = "[REDACTED]"
      continue
    }
    const normalized = executionToolValueNormalize(entry, depth + 1, seen)
    truncated ||= normalized.truncated
    value[key] = normalized.value
  }
  seen.delete(input)
  return { truncated, value }
}

function executionToolPayloadMetadataTruncatedResolve(input: unknown): boolean {
  if (typeof input === "string") {
    try {
      return executionToolPayloadMetadataTruncatedResolve(JSON.parse(input))
    } catch {
      return false
    }
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false
  return (input as Record<string, unknown>).truncated === true
}

function executionToolValueSerialize(input: unknown): ExecutionToolPayloadBound {
  const normalized = executionToolValueNormalize(input, 0, new Set())
  const serialized = JSON.stringify(normalized.value)
  const bounded =
    executionToolPayloadTextEncoder.encode(serialized).byteLength <= executionToolPayloadSerializedLimitBytes
      ? { content: serialized, truncated: false }
      : { content: JSON.stringify(executionToolTextBound(serialized).content), truncated: true }
  return {
    content: bounded.content,
    truncated: normalized.truncated || bounded.truncated || executionToolPayloadMetadataTruncatedResolve(input),
  }
}

function executionToolSerializedBound(input: string): ExecutionToolPayloadBound {
  if (executionToolPayloadTextEncoder.encode(input).byteLength <= executionToolPayloadSerializedLimitBytes) {
    return {
      content: input,
      truncated: executionToolPayloadMetadataTruncatedResolve(input),
    }
  }
  const bounded = executionToolTextBound(input)
  return {
    // The tool payload fields are JSON strings. A truncated JSON string is still a
    // valid field value even when the retained tail is not a complete JSON document.
    content: JSON.stringify(bounded.content),
    truncated: true,
  }
}

export function executionToolPayloadBound(
  input: unknown,
  mode: ExecutionToolPayloadBoundMode = "value",
): ExecutionToolPayloadBound {
  if (mode === "text" && typeof input === "string") return executionToolTextBound(input)
  if (mode === "serialized" && typeof input === "string") return executionToolSerializedBound(input)
  return executionToolValueSerialize(input)
}
