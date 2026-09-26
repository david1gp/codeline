import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { ApiErrorCatalog } from "./apiErrorCatalog.js"
import type { ApiErrorCatalogEntry } from "./apiErrorCatalogEntry.js"

const platformInternalEntry = {
  code: "platform.internal",
  httpStatus: 500,
  retryable: false,
} as const satisfies ApiErrorCatalogEntry

const genericEntries = [
  platformInternalEntry,
  { code: "bad_request", httpStatus: 400, retryable: false },
  { code: "conflict", httpStatus: 409, retryable: false },
  { code: "database_not_ready", httpStatus: 503, retryable: true },
  { code: "development_identity_unavailable", httpStatus: 503, retryable: true },
  { code: "forbidden", httpStatus: 403, retryable: false },
  { code: "internal_server_error", httpStatus: 500, retryable: false },
  { code: "not_found", httpStatus: 404, retryable: false },
  { code: "unauthorized", httpStatus: 401, retryable: false },
] as const satisfies readonly ApiErrorCatalogEntry[]

const httpStatuses = new Set<ApiErrorCatalogEntry["httpStatus"]>([400, 401, 403, 404, 409, 429, 500, 503])

export function apiErrorCatalogCreate(
  ...catalogs: readonly (readonly ApiErrorCatalogEntry[])[]
): Result<ApiErrorCatalog> {
  const op = "apiErrorCatalogCreate"
  const entries = new Map<string, ApiErrorCatalogEntry>()

  for (const entry of [...genericEntries, ...catalogs.flat()]) {
    if (typeof entry.code !== "string" || entry.code.trim().length === 0)
      return createResultError(op, "The API error catalog code is invalid.")
    if (!httpStatuses.has(entry.httpStatus))
      return createResultError(op, `The API error catalog status is invalid for ${entry.code}.`)
    if (typeof entry.retryable !== "boolean")
      return createResultError(op, `The API error catalog retryability is invalid for ${entry.code}.`)
    if (entries.has(entry.code))
      return createResultError(op, `The API error catalog code is duplicated: ${entry.code}.`)
    entries.set(entry.code, entry)
  }

  const entryResolve = (code: string | undefined): ApiErrorCatalogEntry =>
    entries.get(code ?? "") ?? platformInternalEntry
  const codeResolve = (code: string | undefined): string => entryResolve(code).code
  const httpStatusResolve = (code: string | undefined): ApiErrorCatalogEntry["httpStatus"] =>
    entryResolve(code).httpStatus
  const retryableResolve = (code: string | undefined): boolean => entryResolve(code).retryable

  return createResult({ codeResolve, entryResolve, httpStatusResolve, retryableResolve })
}
