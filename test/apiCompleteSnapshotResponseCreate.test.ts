import { expect, test } from "bun:test"
import { apiCompleteSnapshotResponseCreate } from "../src/api/response/apiCompleteSnapshotResponseCreate.js"

const dependencies = {
  compressionStreamCreate: (encoding: "deflate" | "gzip") => new CompressionStream(encoding),
}

test("Accept-Encoding honors q-values and does not compress when identity is preferred", async () => {
  const result = await apiCompleteSnapshotResponseCreate(
    { value: "snapshot" },
    {
      acceptEncoding: "gzip;q=0.5, identity;q=1",
      dependencies,
      headers: new Headers({ ETag: '"snapshot"' }),
    },
  )

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.headers.get("Content-Encoding")).toBeNull()
  expect(await result.data.json()).toEqual({ value: "snapshot" })
})

test("forbidden identity returns no acceptable representation", async () => {
  const result = await apiCompleteSnapshotResponseCreate(
    { value: "snapshot" },
    {
      acceptEncoding: "gzip;q=0, identity;q=0",
      dependencies,
      headers: {},
    },
  )

  expect(result).toMatchObject({ code: "not_acceptable", success: false })
})

test("compression failures fall back to identity without a false Content-Encoding", async () => {
  const result = await apiCompleteSnapshotResponseCreate(
    { value: "snapshot" },
    {
      acceptEncoding: "gzip",
      dependencies: {
        compressionStreamCreate: () => {
          throw new Error("compressor unavailable")
        },
      },
      headers: {},
    },
  )

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.headers.get("Content-Encoding")).toBeNull()
  expect(await result.data.json()).toEqual({ value: "snapshot" })
})

test("identity;q=0 prevents an unsafe compression fallback", async () => {
  const result = await apiCompleteSnapshotResponseCreate(
    { value: "snapshot" },
    {
      acceptEncoding: "gzip, identity;q=0",
      dependencies: {
        compressionStreamCreate: () => {
          throw new Error("compressor unavailable")
        },
      },
      headers: {},
    },
  )

  expect(result).toMatchObject({ success: false })
})
