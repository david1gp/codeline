import { expect, test } from "bun:test"
import { apiErrorCatalogCreate } from "./apiErrorCatalogCreate.js"

test("apiErrorCatalogCreate combines domain entries and resolves their metadata", () => {
  const result = apiErrorCatalogCreate(
    [{ code: "projects.not-found", httpStatus: 404, retryable: false }],
    [{ code: "projects.rate-limited", httpStatus: 429, retryable: true }],
  )

  expect(result.success).toBe(true)
  if (!result.success) return

  expect(result.data.codeResolve("projects.not-found")).toBe("projects.not-found")
  expect(result.data.httpStatusResolve("projects.not-found")).toBe(404)
  expect(result.data.retryableResolve("projects.rate-limited")).toBe(true)
  expect(result.data.httpStatusResolve("database_not_ready")).toBe(503)
  expect(result.data.retryableResolve("database_not_ready")).toBe(true)
})

test("apiErrorCatalogCreate rejects duplicate codes", () => {
  const result = apiErrorCatalogCreate([
    { code: "projects.not-found", httpStatus: 404, retryable: false },
    { code: "projects.not-found", httpStatus: 409, retryable: false },
  ])

  expect(result).toMatchObject({
    success: false,
    op: "apiErrorCatalogCreate",
  })
})

test("apiErrorCatalogCreate maps unknown codes to the platform fallback", () => {
  const result = apiErrorCatalogCreate()

  expect(result.success).toBe(true)
  if (!result.success) return

  expect(result.data.codeResolve("unknown.code")).toBe("platform.internal")
  expect(result.data.httpStatusResolve("unknown.code")).toBe(500)
  expect(result.data.retryableResolve("unknown.code")).toBe(false)
})
