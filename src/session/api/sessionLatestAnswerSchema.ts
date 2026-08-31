import * as v from "valibot"
import { messageApiRecordSchema } from "../../message/api/messageApiRecordSchema.js"

const sessionLatestAnswerContentMaximumBytes = 16_384
const sessionLatestAnswerContentMaximumCharacters = 16_384
const sessionLatestAnswerMetadataMaximumBytes = 16_384
const sessionLatestAnswerMetadataMaximumCharacters = 8_192
const sessionLatestAnswerMetadataNestedStringMaximumCharacters = 4_096
const sessionLatestAnswerMetadataMaximumCollection = 50
const sessionLatestAnswerMetadataMaximumDepth = 5
const sessionLatestAnswerMetadataMaximumKeyCharacters = 128
const sessionLatestAnswerTextEncoder = new TextEncoder()

function sessionLatestAnswerMetadataIsBounded(input: unknown, depth = 0, seen = new Set<object>()): boolean {
  if (input === null || typeof input === "boolean") return true
  if (typeof input === "number") return Number.isFinite(input)
  if (typeof input === "string") {
    const maximumCharacters =
      depth === 0
        ? sessionLatestAnswerMetadataMaximumCharacters
        : sessionLatestAnswerMetadataNestedStringMaximumCharacters
    return (
      input.length <= maximumCharacters &&
      sessionLatestAnswerTextEncoder.encode(input).byteLength <= sessionLatestAnswerMetadataMaximumBytes
    )
  }
  if (typeof input !== "object" || depth >= sessionLatestAnswerMetadataMaximumDepth || seen.has(input)) return false

  seen.add(input)
  if (Array.isArray(input)) {
    if (input.length > sessionLatestAnswerMetadataMaximumCollection) {
      seen.delete(input)
      return false
    }
    const bounded = input.every((value) => sessionLatestAnswerMetadataIsBounded(value, depth + 1, seen))
    seen.delete(input)
    return bounded
  }

  if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
    seen.delete(input)
    return false
  }
  const entries = Object.entries(input)
  if (entries.length > sessionLatestAnswerMetadataMaximumCollection) {
    seen.delete(input)
    return false
  }
  const bounded = entries.every(
    ([key, value]) =>
      key.length <= sessionLatestAnswerMetadataMaximumKeyCharacters &&
      sessionLatestAnswerMetadataIsBounded(value, depth + 1, seen),
  )
  seen.delete(input)
  return bounded
}

function sessionLatestAnswerMetadataHasBoundedBytes(input: unknown): boolean {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(input)
  } catch (_error) {
    return false
  }
  return (
    serialized !== undefined &&
    sessionLatestAnswerTextEncoder.encode(serialized).byteLength <= sessionLatestAnswerMetadataMaximumBytes
  )
}

const sessionLatestAnswerContentSchema = v.pipe(
  v.string(),
  v.maxLength(sessionLatestAnswerContentMaximumCharacters),
  v.check(
    (content) => sessionLatestAnswerTextEncoder.encode(content).byteLength <= sessionLatestAnswerContentMaximumBytes,
    "The latest answer content exceeds the bounded payload size.",
  ),
)
const sessionLatestAnswerMetadataSchema = v.pipe(
  v.unknown(),
  v.check(
    (metadata) =>
      sessionLatestAnswerMetadataIsBounded(metadata) && sessionLatestAnswerMetadataHasBoundedBytes(metadata),
    "The latest answer metadata exceeds the bounded payload limits.",
  ),
)

const assistantMessageApiRecordSchema = v.pipe(
  v.strictObject({
    ...messageApiRecordSchema.entries,
    content: sessionLatestAnswerContentSchema,
    metadata: sessionLatestAnswerMetadataSchema,
  }),
  v.check((message) => message.role === "assistant", "The latest answer must be an assistant message."),
)

export const sessionLatestAnswerSchema = v.nullable(assistantMessageApiRecordSchema)

export type SessionLatestAnswer = v.InferOutput<typeof sessionLatestAnswerSchema>
