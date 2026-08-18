import { expect, test } from "bun:test"

const envExample = await Bun.file(new URL("../.env.example", import.meta.url)).text()
const compose = await Bun.file(new URL("../ops/dev/compose.yaml", import.meta.url)).text()
const zeroProvider = await Bun.file(new URL("../src/ui/CodelineZeroProvider.tsx", import.meta.url)).text()
const viteConfiguration = await Bun.file(new URL("../vite.config.ts", import.meta.url)).text()
const sessionListState = await Bun.file(new URL("../src/ui/sessionListStateCreate.ts", import.meta.url)).text()

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

test("preview browser and managed cache use matching HTTPS query and mutation URLs", () => {
  const publicOrigin = environmentValue("PUBLIC_ORIGIN")
  expect(publicOrigin).toBe("https://preview.codeline.work")
  expect(environmentValue("VITE_ZERO_CACHE_URL")).toBe(publicOrigin)
  expect(environmentValue("VITE_ZERO_QUERY_URL")).toBe(`${publicOrigin}/api/query`)
  expect(environmentValue("VITE_ZERO_MUTATE_URL")).toBe(`${publicOrigin}/api/mutate`)
  expect(environmentValue("ZERO_QUERY_URL")).toBe(`${publicOrigin}/api/query`)
  expect(environmentValue("ZERO_MUTATE_URL")).toBe(`${publicOrigin}/api/mutate`)
  expect(zeroProvider).toContain("cacheURL={import.meta.env.VITE_ZERO_CACHE_URL ?? window.location.origin}")
  expect(zeroProvider).toContain(
    "mutateURL={import.meta.env.VITE_ZERO_MUTATE_URL ?? `${window.location.origin}/api/mutate`}",
  )
  expect(zeroProvider).toContain(
    "queryURL={import.meta.env.VITE_ZERO_QUERY_URL ?? `${window.location.origin}/api/query`}",
  )
  expect(zeroProvider).not.toContain("auth=")
})

test("the sidebar page size is exposed to Vite from the server setting", () => {
  expect(environmentValue("SESSIONS_SIDEBAR_PAGE_SIZE")).toBe("25")
  expect(environmentValue("VITE_SESSIONS_SIDEBAR_PAGE_SIZE")).toBeUndefined()
  expect(viteConfiguration).toContain(
    '"import.meta.env.VITE_SESSIONS_SIDEBAR_PAGE_SIZE": JSON.stringify(env.SESSIONS_SIDEBAR_PAGE_SIZE ?? "25")',
  )
  expect(sessionListState).toContain("import.meta.env.VITE_SESSIONS_SIDEBAR_PAGE_SIZE")
})
