import { expect, test } from "bun:test"
import * as v from "valibot"
import { apiErrorCatalogCreate } from "./apiErrorCatalogCreate.js"
import { apiErrorResponseCreate } from "./apiErrorResponseCreate.js"
import { apiErrorResponseSchema } from "./apiErrorResponseSchema.js"

const catalogResult = apiErrorCatalogCreate([{ code: "projects.not-found", httpStatus: 404, retryable: false }])

test("apiErrorResponseCreate preserves coded result metadata", () => {
  expect(catalogResult.success).toBe(true)
  if (!catalogResult.success) return

  const mapped = apiErrorResponseCreate(
    {
      success: false,
      code: "projects.not-found",
      errorData: JSON.stringify({ projectId: "missing" }),
      errorMessage: "The project was not found.",
      op: "projectLoad",
      statusCode: 404,
    },
    catalogResult.data,
  )

  expect(mapped).toEqual({
    body: {
      error: {
        code: "projects.not-found",
        details: { projectId: "missing" },
        message: "The project was not found.",
        op: "projectLoad",
        retryable: false,
        status: 404,
      },
    },
    status: 404,
  })
  expect(v.safeParse(apiErrorResponseSchema, mapped.body).success).toBe(true)
})

test("apiErrorResponseCreate uses a valid result status before catalog status", () => {
  expect(catalogResult.success).toBe(true)
  if (!catalogResult.success) return

  const mapped = apiErrorResponseCreate(
    {
      success: false,
      code: "projects.not-found",
      errorMessage: "The project lookup was rate limited.",
      op: "projectLoad",
      statusCode: 429,
    },
    catalogResult.data,
  )

  expect(mapped.status).toBe(429)
  expect(mapped.body.error).toMatchObject({ code: "projects.not-found", status: 429 })
})

test("apiErrorResponseCreate safely maps uncoded and unknown results", () => {
  const result = apiErrorCatalogCreate()
  expect(result.success).toBe(true)
  if (!result.success) return

  const mapped = apiErrorResponseCreate(
    {
      success: false,
      errorData: "not-json",
      errorMessage: "The internal operation failed.",
      op: "internalOperation",
      statusCode: 503,
    },
    result.data,
  )

  expect(mapped).toEqual({
    body: {
      error: {
        code: "platform.internal",
        details: { errorData: "not-json" },
        message: "The internal operation failed.",
        op: "internalOperation",
        retryable: false,
        status: 500,
      },
    },
    status: 500,
  })
  expect(v.safeParse(apiErrorResponseSchema, mapped.body).success).toBe(true)
})
