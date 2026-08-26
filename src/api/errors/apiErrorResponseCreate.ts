import type { ResultErr } from "@adaptive-ds/result"
import * as v from "valibot"
import type { ApiErrorCatalog } from "./apiErrorCatalog.js"
import type { ApiErrorCatalogEntry } from "./apiErrorCatalogEntry.js"
import type { ApiErrorResponse } from "./apiErrorResponseSchema.js"

const apiErrorHttpStatuses = new Set<ApiErrorCatalogEntry["httpStatus"]>([400, 401, 403, 404, 409, 429, 500, 503])

export function apiErrorResponseCreate(
  result: ResultErr,
  catalog: ApiErrorCatalog,
): { body: ApiErrorResponse; status: ApiErrorCatalogEntry["httpStatus"] } {
  const code = catalog.codeResolve(result.code)
  const status =
    code === result.code
      ? apiErrorStatusResolve(result.statusCode, catalog.httpStatusResolve(result.code))
      : catalog.httpStatusResolve(result.code)
  const details = apiErrorDetailsResolve(result.errorData)
  const error = {
    code,
    ...(details === undefined ? {} : { details }),
    message: result.errorMessage,
    op: result.op,
    retryable: catalog.retryableResolve(result.code),
    status,
  }

  return {
    body: { error } satisfies ApiErrorResponse,
    status,
  }
}

function apiErrorStatusResolve(
  statusCode: number | undefined,
  fallback: ApiErrorCatalogEntry["httpStatus"],
): ApiErrorCatalogEntry["httpStatus"] {
  if (statusCode !== undefined && apiErrorHttpStatuses.has(statusCode as ApiErrorCatalogEntry["httpStatus"]))
    return statusCode as ApiErrorCatalogEntry["httpStatus"]
  return fallback
}

function apiErrorDetailsResolve(errorData: string | null | undefined): Record<string, unknown> | undefined {
  if (errorData === undefined || errorData === null) return undefined
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson()), errorData)
  if (parsed.success && parsed.output !== null && typeof parsed.output === "object" && !Array.isArray(parsed.output))
    return parsed.output as Record<string, unknown>
  return { errorData }
}
