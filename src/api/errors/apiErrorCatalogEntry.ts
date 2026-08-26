export type ApiErrorCatalogEntry = {
  readonly code: string
  readonly httpStatus: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503
  readonly retryable: boolean
}
