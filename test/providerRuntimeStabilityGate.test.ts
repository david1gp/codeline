import { expect, test } from "bun:test"

const packageJson = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text()) as {
  scripts: Record<string, string>
}
const releaseScript = await Bun.file(new URL("../ops/release.sh", import.meta.url)).text()

test("the release stability gate keeps provider integration opt-in", () => {
  const defaultTest = packageJson.scripts.test
  const providerIntegrationTest = packageJson.scripts["test:integration"]

  expect(defaultTest).toContain("--path-ignore-patterns='**/providerRuntimeChatIntegration.test.ts'")
  expect(defaultTest).toContain("./src ./test")
  expect(providerIntegrationTest).toContain("./test/providerRuntimeChatIntegration.test.ts")
  expect(releaseScript).toContain("bun run test\n")
  expect(releaseScript).not.toContain("bun run test:integration")
})
