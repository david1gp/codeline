import { expect, test } from "bun:test"

test("the web manifest is installable and references existing icons", async () => {
  const manifest = (await Bun.file("public/manifest.webmanifest").json()) as {
    name: string
    start_url: string
    display: string
    icons: { src: string; sizes: string; type: string; purpose: string }[]
  }

  expect(manifest.name).toBe("Codeline")
  expect(manifest.start_url).toBe("/")
  expect(manifest.display).toBe("standalone")
  expect(manifest.icons.some((icon) => icon.sizes === "192x192")).toBe(true)
  expect(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable")).toBe(true)

  for (const icon of manifest.icons) {
    expect(await Bun.file(`public${icon.src}`).exists()).toBe(true)
  }
})
