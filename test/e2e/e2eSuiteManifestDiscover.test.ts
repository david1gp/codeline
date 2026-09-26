import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { e2eSuiteManifestDiscover } from "../../e2e/e2eSuiteManifestDiscover.js"

test("discovery groups ordered nested steps per workflow and includes root specs during migration", async () => {
  const root = await mkdtemp(join(tmpdir(), "e2e-discovery-"))
  try {
    await mkdir(join(root, "e2e", "alpha", "nested"), { recursive: true })
    await mkdir(join(root, "e2e", "beta"))
    await mkdir(join(root, "e2e", "empty"))
    for (const path of [
      "z.spec.ts",
      "alpha/z.spec.ts",
      "alpha/a.spec.ts",
      "alpha/nested/b.spec.ts",
      "beta/b.spec.ts",
      "beta/ignore.ts",
    ]) {
      await writeFile(join(root, "e2e", path), "")
    }
    expect(await e2eSuiteManifestDiscover(root)).toEqual([
      { id: "e2e/alpha", steps: ["e2e/alpha/a.spec.ts", "e2e/alpha/nested/b.spec.ts", "e2e/alpha/z.spec.ts"] },
      { id: "e2e/beta", steps: ["e2e/beta/b.spec.ts"] },
      { id: "e2e/z.spec.ts", steps: ["e2e/z.spec.ts"] },
    ])
    await rm(join(root, "e2e", "z.spec.ts"))
    expect((await e2eSuiteManifestDiscover(root)).map((suite) => suite.id)).toEqual(["e2e/alpha", "e2e/beta"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
