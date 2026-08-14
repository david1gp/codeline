import { expect, test } from "bun:test"

const envExample = await Bun.file(new URL("../.env.example", import.meta.url)).text()
const compose = await Bun.file(new URL("../ops/dev/compose.yaml", import.meta.url)).text()
const zeroProvider = await Bun.file(new URL("../src/ui/CodelineZeroProvider.tsx", import.meta.url)).text()

function environmentValue(name: string): string | undefined {
  const line = envExample.split("\n").find((entry) => entry.startsWith(`${name}=`))
  return line?.slice(name.length + 1)
}

test("managed Zero forwards opaque cookies and periodically revalidates auth", () => {
  expect(environmentValue("ZERO_QUERY_FORWARD_COOKIES")).toBe("true")
  expect(environmentValue("ZERO_MUTATE_FORWARD_COOKIES")).toBe("true")
  expect(environmentValue("ZERO_AUTH_REVALIDATE_INTERVAL_SECONDS")).toBe("300")
  expect(compose).toContain("ZERO_QUERY_FORWARD_COOKIES: ${ZERO_QUERY_FORWARD_COOKIES:-true}")
  expect(compose).toContain("ZERO_MUTATE_FORWARD_COOKIES: ${ZERO_MUTATE_FORWARD_COOKIES:-true}")
  expect(compose).toContain("ZERO_AUTH_REVALIDATE_INTERVAL_SECONDS: ${ZERO_AUTH_REVALIDATE_INTERVAL_SECONDS:-300}")
})

test("local Zero uses direct managed endpoints while production falls back to same-origin URLs", () => {
  expect(environmentValue("VITE_ZERO_CACHE_URL")).toBe("http://127.0.0.1:6003")
  expect(environmentValue("VITE_ZERO_QUERY_URL")).toBe("http://127.0.0.1:6001/api/query")
  expect(environmentValue("VITE_ZERO_MUTATE_URL")).toBe("http://127.0.0.1:6001/api/mutate")
  expect(environmentValue("ZERO_QUERY_URL")).toBe("http://host.containers.internal:6001/api/query")
  expect(environmentValue("ZERO_MUTATE_URL")).toBe("http://host.containers.internal:6001/api/mutate")
  expect(zeroProvider).toContain("cacheURL={import.meta.env.VITE_ZERO_CACHE_URL ?? window.location.origin}")
  expect(zeroProvider).toContain(
    "mutateURL={import.meta.env.VITE_ZERO_MUTATE_URL ?? `${window.location.origin}/api/mutate`}",
  )
  expect(zeroProvider).toContain(
    "queryURL={import.meta.env.VITE_ZERO_QUERY_URL ?? `${window.location.origin}/api/query`}",
  )
  expect(zeroProvider).not.toContain("auth=")
})
