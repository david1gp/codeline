import type { ApiErrorCatalogEntry } from "./apiErrorCatalogEntry.js"

export type ApiErrorCatalog = {
  codeResolve: (code: string | undefined) => string
  entryResolve: (code: string | undefined) => ApiErrorCatalogEntry
  httpStatusResolve: (code: string | undefined) => ApiErrorCatalogEntry["httpStatus"]
  retryableResolve: (code: string | undefined) => boolean
}
