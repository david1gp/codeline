import { createCipheriv, createDecipheriv, createHash, createHmac } from "node:crypto"
import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type JournalCursorClaims, journalCursorClaimsSchema } from "../schema/journalCursorClaimsSchema.js"
import { type JournalCursor, journalCursorSchema } from "../schema/journalCursorSchema.js"

type JournalCursorCodecDependencies = {
  randomBytes: (size: number) => Uint8Array
  secret: string | Uint8Array
}

export type JournalCursorCodec = {
  decode: (cursor: unknown) => Result<JournalCursorClaims>
  decodePayload?: (cursor: unknown) => Result<unknown>
  encode: (journalId: unknown, sequence: unknown) => Result<JournalCursor>
  encodeDeterministic: (journalId: unknown, sequence: unknown) => Result<JournalCursor>
  encodePayload?: (payload: unknown) => Result<JournalCursor>
  validate: (cursor: unknown, journalId: unknown) => Result<JournalCursorClaims>
}

const cursorVersion = "v1"
const initializationVectorLength = 12
const authenticationTagLength = 16
const deterministicCursorVersion = "v1d"
const payloadCursorVersion = "p1"

function base64UrlEncode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url")
}

function base64UrlDecode(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined
  try {
    const decoded = Buffer.from(value, "base64url")
    if (decoded.toString("base64url") !== value) return undefined
    return decoded
  } catch (_error) {
    return undefined
  }
}

export function journalCursorCodecCreate(dependencies: JournalCursorCodecDependencies): Result<JournalCursorCodec> {
  const op = "journalCursorCodecCreate"
  if (typeof dependencies.randomBytes !== "function")
    return createResultError(op, "The cursor random source is required.")
  if (typeof dependencies.secret !== "string" && !(dependencies.secret instanceof Uint8Array)) {
    return createResultError(op, "The cursor secret is invalid.")
  }
  if (dependencies.secret.length === 0) return createResultError(op, "The cursor secret is required.")

  const key = createHash("sha256").update(dependencies.secret).digest()

  const claimsParse = (journalId: unknown, sequence: unknown, op: string): Result<JournalCursorClaims> => {
    const parsedClaims = v.safeParse(journalCursorClaimsSchema, { journalId, sequence, version: 1 })
    if (!parsedClaims.success) return createResultError(op, "The journal cursor claims are invalid.")
    return createResult(parsedClaims.output)
  }

  const deterministicInitializationVectorCreate = (plaintext: string): Uint8Array =>
    createHmac("sha256", key).update(`${deterministicCursorVersion}\u0000${plaintext}`, "utf8").digest().subarray(0, 12)

  const encode = (journalId: unknown, sequence: unknown): Result<JournalCursor> => {
    const encodeOp = "journalCursorEncode"
    const parsedClaims = claimsParse(journalId, sequence, encodeOp)
    if (!parsedClaims.success) return parsedClaims

    try {
      const initializationVector = dependencies.randomBytes(initializationVectorLength)
      if (!(initializationVector instanceof Uint8Array) || initializationVector.length !== initializationVectorLength) {
        return createResultError(encodeOp, "The journal cursor random source returned invalid bytes.")
      }
      const cipher = createCipheriv("aes-256-gcm", key, initializationVector)
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsedClaims.data), "utf8"), cipher.final()])
      const token = `${cursorVersion}.${base64UrlEncode(initializationVector)}.${base64UrlEncode(
        Buffer.concat([ciphertext, cipher.getAuthTag()]),
      )}`
      const parsedCursor = v.safeParse(journalCursorSchema, token)
      if (!parsedCursor.success) return createResultError(encodeOp, "The journal cursor could not be encoded.")
      return createResult(parsedCursor.output)
    } catch (_error) {
      return createResultError(encodeOp, "The journal cursor could not be encoded.")
    }
  }

  const encodeDeterministic = (journalId: unknown, sequence: unknown): Result<JournalCursor> => {
    const encodeOp = "journalCursorEncodeDeterministic"
    const parsedClaims = claimsParse(journalId, sequence, encodeOp)
    if (!parsedClaims.success) return parsedClaims

    try {
      const plaintext = JSON.stringify(parsedClaims.data)
      const initializationVector = deterministicInitializationVectorCreate(plaintext)
      const cipher = createCipheriv("aes-256-gcm", key, initializationVector)
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
      const token = `${deterministicCursorVersion}.${base64UrlEncode(initializationVector)}.${base64UrlEncode(
        Buffer.concat([ciphertext, cipher.getAuthTag()]),
      )}`
      const parsedCursor = v.safeParse(journalCursorSchema, token)
      if (!parsedCursor.success) return createResultError(encodeOp, "The journal cursor could not be encoded.")
      return createResult(parsedCursor.output)
    } catch (_error) {
      return createResultError(encodeOp, "The journal cursor could not be encoded.")
    }
  }

  const decode = (cursor: unknown): Result<JournalCursorClaims> => {
    const decodeOp = "journalCursorDecode"
    const parsedCursor = v.safeParse(journalCursorSchema, cursor)
    if (!parsedCursor.success)
      return createResultErrorCode(decodeOp, "The journal cursor is invalid.", "cursor_invalid")
    const cursorParts = parsedCursor.output.split(".")
    const [version, initializationVectorPart, ciphertextPart] = cursorParts
    if (
      cursorParts.length !== 3 ||
      (version !== cursorVersion && version !== deterministicCursorVersion) ||
      initializationVectorPart === undefined ||
      ciphertextPart === undefined
    ) {
      return createResultErrorCode(decodeOp, "The journal cursor is invalid.", "cursor_invalid")
    }

    const initializationVector = base64UrlDecode(initializationVectorPart)
    const ciphertextWithTag = base64UrlDecode(ciphertextPart)
    if (
      initializationVector === undefined ||
      initializationVector.length !== initializationVectorLength ||
      ciphertextWithTag === undefined ||
      ciphertextWithTag.length <= authenticationTagLength
    ) {
      return createResultErrorCode(decodeOp, "The journal cursor is invalid.", "cursor_invalid")
    }

    try {
      const ciphertext = ciphertextWithTag.subarray(0, -authenticationTagLength)
      const authenticationTag = ciphertextWithTag.subarray(-authenticationTagLength)
      const decipher = createDecipheriv("aes-256-gcm", key, initializationVector)
      decipher.setAuthTag(authenticationTag)
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
      const parsedClaims = v.safeParse(journalCursorClaimsSchema, JSON.parse(plaintext))
      if (!parsedClaims.success)
        return createResultErrorCode(decodeOp, "The journal cursor is invalid.", "cursor_invalid")
      return createResult(parsedClaims.output)
    } catch (_error) {
      return createResultErrorCode(decodeOp, "The journal cursor is invalid.", "cursor_invalid")
    }
  }

  const encodePayload = (payload: unknown): Result<JournalCursor> => {
    const encodeOp = "journalCursorPayloadEncode"
    let plaintext: string
    try {
      plaintext = JSON.stringify(payload)
    } catch (_error) {
      return createResultError(encodeOp, "The cursor payload could not be encoded.")
    }
    if (plaintext === undefined) return createResultError(encodeOp, "The cursor payload could not be encoded.")

    try {
      const initializationVector = dependencies.randomBytes(initializationVectorLength)
      if (!(initializationVector instanceof Uint8Array) || initializationVector.length !== initializationVectorLength)
        return createResultError(encodeOp, "The cursor random source returned invalid bytes.")
      const cipher = createCipheriv("aes-256-gcm", key, initializationVector)
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
      const token = `${payloadCursorVersion}.${base64UrlEncode(initializationVector)}.${base64UrlEncode(
        Buffer.concat([ciphertext, cipher.getAuthTag()]),
      )}`
      const parsedCursor = v.safeParse(journalCursorSchema, token)
      if (!parsedCursor.success) return createResultError(encodeOp, "The cursor payload could not be encoded.")
      return createResult(parsedCursor.output)
    } catch (_error) {
      return createResultError(encodeOp, "The cursor payload could not be encoded.")
    }
  }

  const decodePayload = (cursor: unknown): Result<unknown> => {
    const decodeOp = "journalCursorPayloadDecode"
    const parsedCursor = v.safeParse(journalCursorSchema, cursor)
    if (!parsedCursor.success)
      return createResultErrorCode(decodeOp, "The cursor payload is invalid.", "cursor_invalid")
    const cursorParts = parsedCursor.output.split(".")
    const [version, initializationVectorPart, ciphertextPart] = cursorParts
    if (
      cursorParts.length !== 3 ||
      version !== payloadCursorVersion ||
      initializationVectorPart === undefined ||
      ciphertextPart === undefined
    )
      return createResultErrorCode(decodeOp, "The cursor payload is invalid.", "cursor_invalid")

    const initializationVector = base64UrlDecode(initializationVectorPart)
    const ciphertextWithTag = base64UrlDecode(ciphertextPart)
    if (
      initializationVector === undefined ||
      initializationVector.length !== initializationVectorLength ||
      ciphertextWithTag === undefined ||
      ciphertextWithTag.length <= authenticationTagLength
    )
      return createResultErrorCode(decodeOp, "The cursor payload is invalid.", "cursor_invalid")

    try {
      const ciphertext = ciphertextWithTag.subarray(0, -authenticationTagLength)
      const authenticationTag = ciphertextWithTag.subarray(-authenticationTagLength)
      const decipher = createDecipheriv("aes-256-gcm", key, initializationVector)
      decipher.setAuthTag(authenticationTag)
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
      return createResult(JSON.parse(plaintext) as unknown)
    } catch (_error) {
      return createResultErrorCode(decodeOp, "The cursor payload is invalid.", "cursor_invalid")
    }
  }

  const validate = (cursor: unknown, journalId: unknown): Result<JournalCursorClaims> => {
    const validateOp = "journalCursorValidate"
    const parsedJournalId = v.safeParse(journalCursorClaimsSchema.entries.journalId, journalId)
    if (!parsedJournalId.success)
      return createResultErrorCode(validateOp, "The journal cursor owner is invalid.", "cursor_invalid")
    const decoded = decode(cursor)
    if (!decoded.success) return decoded
    if (decoded.data.journalId !== parsedJournalId.output) {
      return createResultErrorCode(validateOp, "The journal cursor belongs to another user.", "cursor_owner_mismatch")
    }
    return decoded
  }

  return createResult({ decode, decodePayload, encode, encodeDeterministic, encodePayload, validate })
}
