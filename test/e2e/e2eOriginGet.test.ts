import { afterEach, expect, test } from "bun:test"
import { e2eOriginGet } from "../../e2e/e2eOriginGet.js"

const originalOrigin = process.env.PUBLIC_ORIGIN

afterEach(() => {
  if (originalOrigin === undefined) delete process.env.PUBLIC_ORIGIN
  else process.env.PUBLIC_ORIGIN = originalOrigin
})

test("the e2e origin resolver returns the explicitly configured origin", () => {
  process.env.PUBLIC_ORIGIN = "https://preview.codeline.work"
  expect(e2eOriginGet()).toBe("https://preview.codeline.work")
})

test("the e2e origin resolver accepts loopback http origins for local runs", () => {
  process.env.PUBLIC_ORIGIN = "http://127.0.0.1:9"
  expect(e2eOriginGet()).toBe("http://127.0.0.1:9")
})

test("the e2e origin resolver throws without a default when the origin is unset", () => {
  delete process.env.PUBLIC_ORIGIN
  expect(() => e2eOriginGet()).toThrow("PUBLIC_ORIGIN is not set. There is no default environment.")
})

test("the e2e origin resolver rejects blank and malformed origins", () => {
  for (const raw of [
    "   ",
    "not-an-origin",
    "ftp://preview.codeline.work",
    "https://preview.codeline.work/e2e",
    "https://preview.codeline.work/",
  ]) {
    expect(() => e2eOriginGet(raw)).toThrow("There is no default environment.")
  }
})

test("the e2e origin resolver names a custom variable in the failure", () => {
  expect(() => e2eOriginGet(undefined, "E2E_DEV_ORIGIN")).toThrow(
    "E2E_DEV_ORIGIN is not set. There is no default environment.",
  )
})
