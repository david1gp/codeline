import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { apiRepresentationEtagCreate } from "../src/api/representation/apiRepresentationEtagCreate.js"

const cases = [
  { representationIdentity: "note:note-etag-test", schemaVersion: "note-v1", revision: 4 },
  { representationIdentity: "session:session-etag-test", schemaVersion: "session-v1", revision: 4 },
  { representationIdentity: "emoji:😀", schemaVersion: "v1", revision: 42 },
  { representationIdentity: `long:${"x".repeat(140)}`, schemaVersion: "v1", revision: 0 },
]

test("ETags preserve the server SHA-256 and base64url representation", () => {
  for (const input of cases) {
    const framedInput = `${input.representationIdentity}\u0000${input.schemaVersion}\u0000${input.revision}`
    const expected = `"${createHash("sha256").update(framedInput, "utf8").digest("base64url")}"`
    expect(apiRepresentationEtagCreate(input.representationIdentity, input.schemaVersion, input.revision)).toBe(
      expected,
    )
  }
})

test("note ETag browser entry bundles without Node crypto", async () => {
  const build = await Bun.build({
    entrypoints: [new URL("../src/note/api/noteRepresentationEtagCreate.ts", import.meta.url).pathname],
    format: "esm",
    target: "browser",
    write: false,
  } as Parameters<typeof Bun.build>[0] & { write: false })
  expect(build.success).toBe(true)
  if (!build.success) return
  const output = build.outputs[0]
  expect(output).toBeDefined()
  if (output === undefined) return
  const bundle = await output.text()
  expect(bundle).not.toContain("node:crypto")
  expect(bundle).not.toContain("createHash")
})
