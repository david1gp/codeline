import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"

type CompressionEncoding = "deflate" | "gzip"
type CompressionSelection = { encoding?: CompressionEncoding; identityAllowed: boolean }

type ApiCompleteSnapshotResponseDependencies = {
  compressionStreamCreate: (encoding: CompressionEncoding) => CompressionStream
}

export async function apiCompleteSnapshotResponseCreate(
  body: unknown,
  options: {
    acceptEncoding?: string
    dependencies: ApiCompleteSnapshotResponseDependencies
    headers: HeadersInit
  },
): Promise<Result<Response>> {
  const op = "apiCompleteSnapshotResponseCreate"

  let serialized: string
  try {
    serialized = JSON.stringify(body)
  } catch (_error) {
    return createResultError(op, "The snapshot could not be serialized.")
  }
  if (serialized === undefined) return createResultError(op, "The snapshot could not be serialized.")

  const headers = new Headers(options.headers)
  headers.set("Content-Type", "application/json; charset=UTF-8")
  const selection = compressionEncodingResolve(options.acceptEncoding)
  if (selection === undefined)
    return createResultErrorCode(op, "No acceptable content encoding is available.", "not_acceptable")
  const encoding = selection.encoding
  if (encoding === undefined) {
    headers.delete("Content-Encoding")
    headers.set("Content-Length", String(new TextEncoder().encode(serialized).byteLength))
    return createResult(new Response(serialized, { headers }))
  }

  try {
    const compressedStream = new Blob([serialized])
      .stream()
      .pipeThrough(options.dependencies.compressionStreamCreate(encoding))
    const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer())
    headers.set("Content-Encoding", encoding)
    headers.set("Content-Length", String(compressed.byteLength))
    return createResult(new Response(compressed, { headers }))
  } catch (_error) {
    if (!selection.identityAllowed) return createResultError(op, "The snapshot could not be compressed.")
    headers.delete("Content-Encoding")
    headers.set("Content-Length", String(new TextEncoder().encode(serialized).byteLength))
    return createResult(new Response(serialized, { headers }))
  }
}

function compressionEncodingResolve(header: string | undefined): CompressionSelection | undefined {
  if (header === undefined || header.trim() === "") return { identityAllowed: true }

  const entries = header
    .split(",")
    .map((entry) => compressionEntryParse(entry))
    .filter((entry): entry is { name: string; quality: number } => entry !== undefined)
  const wildcard = compressionQualityResolve(entries, "*")
  const identityQuality = compressionQualityResolve(entries, "identity") ?? (wildcard === undefined ? 1 : wildcard)
  const candidates = (["gzip", "deflate"] as const)
    .map((name) => ({ name, quality: compressionQualityResolve(entries, name) ?? wildcard ?? 0 }))
    .filter((entry) => entry.quality > 0)
    .sort((left, right) => right.quality - left.quality)
  const best = candidates[0]
  if (best !== undefined && (identityQuality === undefined || best.quality >= identityQuality))
    return { encoding: best.name, identityAllowed: identityQuality > 0 }
  if (identityQuality > 0) return { identityAllowed: true }
  return undefined
}

function compressionEntryParse(entry: string): { name: string; quality: number } | undefined {
  const [rawName, ...parameters] = entry.trim().toLowerCase().split(";")
  const name = rawName?.trim() ?? ""
  if (name.length === 0) return undefined
  const qualityParameter = parameters.find((parameter) => /^q\s*=/i.test(parameter.trim()))
  if (qualityParameter === undefined) return { name, quality: 1 }
  const qualityValue = qualityParameter.trim().replace(/^q\s*=\s*/i, "")
  const quality = Number(qualityValue)
  if (!Number.isFinite(quality) || quality < 0 || quality > 1 || !/^\d(?:\.\d{0,3})?$/.test(qualityValue))
    return { name, quality: 0 }
  return { name, quality }
}

function compressionQualityResolve(
  entries: Array<{ name: string; quality: number }>,
  name: string,
): number | undefined {
  const matching = entries.filter((entry) => entry.name === name)
  if (matching.length === 0) return undefined
  return Math.min(...matching.map((entry) => entry.quality))
}
