import { createResult, createResultError, type Result } from "@adaptive-ds/result"

const sessionCacheRecordTextEncoder = new TextEncoder()

export function sessionCacheRecordByteSize(input: object): Result<number> {
  const op = "sessionCacheRecordByteSize"
  try {
    const { byteSize: _byteSize, ...serializedRecord } = input as object & { byteSize?: unknown }
    return createResult(sessionCacheRecordTextEncoder.encode(JSON.stringify(serializedRecord)).byteLength)
  } catch {
    return createResultError(op, "The session cache record could not be serialized.")
  }
}
