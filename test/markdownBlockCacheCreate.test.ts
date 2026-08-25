import { expect, test } from "bun:test"
import { markdownBlockCacheCreate } from "../src/markdown/markdownBlockCacheCreate.js"

const baseKey = {
  ownerIdentity: "message-1",
  blockIdentity: "block-1",
  blockType: "paragraph",
  rawContent: "cached source",
  rendererVersion: "renderer-1",
}

test("returns cached blocks on hits and misses changed block content", () => {
  const cache = markdownBlockCacheCreate({ maxEntries: 2 })

  expect(cache.get(baseKey)).toBeUndefined()
  cache.set(baseKey, "<p>cached source</p>")
  expect(cache.get(baseKey)).toBe("<p>cached source</p>")
  expect(cache.get({ ...baseKey, rawContent: "changed source" })).toBeUndefined()
})

test("does not return cached HTML for a raw-content hash collision", () => {
  const cache = markdownBlockCacheCreate({ maxEntries: 2 })
  const firstRawContent = String.fromCharCode(36612, 60484, 23552, 0)
  const secondRawContent = String.fromCharCode(50063, 63851, 32422, 33604)
  const firstKey = { ...baseKey, rawContent: firstRawContent }
  const secondKey = { ...baseKey, rawContent: secondRawContent }

  cache.set(firstKey, "first HTML")

  expect(cache.get(secondKey)).toBeUndefined()

  cache.set(secondKey, "second HTML")
  expect(cache.get(firstKey)).toBeUndefined()
  expect(cache.get(secondKey)).toBe("second HTML")
})

test("isolates owners, block types, and renderer versions", () => {
  const cache = markdownBlockCacheCreate({ maxEntries: 8 })
  cache.set(baseKey, "owner 1")

  expect(cache.get({ ...baseKey, ownerIdentity: "message-2" })).toBeUndefined()
  expect(cache.get({ ...baseKey, blockIdentity: "block-2" })).toBeUndefined()
  expect(cache.get({ ...baseKey, blockType: "heading" })).toBeUndefined()
  expect(cache.get({ ...baseKey, rendererVersion: "renderer-2" })).toBeUndefined()
  expect(cache.get(baseKey)).toBe("owner 1")
})

test("evicts the least recently used block at the entry bound", () => {
  const cache = markdownBlockCacheCreate({ maxEntries: 2 })
  const secondKey = { ...baseKey, blockIdentity: "block-2" }
  const thirdKey = { ...baseKey, blockIdentity: "block-3" }

  cache.set(baseKey, "one")
  cache.set(secondKey, "two")
  expect(cache.get(baseKey)).toBe("one")
  cache.set(thirdKey, "three")

  expect(cache.get(baseKey)).toBe("one")
  expect(cache.get(secondKey)).toBeUndefined()
  expect(cache.get(thirdKey)).toBe("three")
})

test("clear removes entries while keeping the cache reusable", () => {
  const cache = markdownBlockCacheCreate({ maxEntries: 1 })
  cache.set(baseKey, "before clear")
  cache.clear()

  expect(cache.get(baseKey)).toBeUndefined()
  cache.set(baseKey, "after clear")
  expect(cache.get(baseKey)).toBe("after clear")
})

test("dispose clears entries and rejects later writes", () => {
  const cache = markdownBlockCacheCreate({ maxEntries: 1 })
  cache.set(baseKey, "before dispose")
  cache.dispose()

  expect(cache.get(baseKey)).toBeUndefined()
  cache.set(baseKey, "after dispose")
  expect(cache.get(baseKey)).toBeUndefined()
})
