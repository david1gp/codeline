import { expect, test } from "bun:test"
import { markdownHtmlRender } from "../src/markdown/markdownHtmlRender.js"
import { markdownStreamingProjectionCreate } from "../src/markdown/markdownStreamingProjectionCreate.js"

test("derives stable parser blocks and one live trailing block", () => {
  const projection = markdownStreamingProjectionCreate("# Plan\n\nFinished paragraph.\n\n- live item")

  expect(projection.stableBlocks.map((block) => [block.type, block.raw])).toEqual([
    ["atxHeading", "# Plan\n\n"],
    ["paragraph", "Finished paragraph.\n\n"],
  ])
  expect(projection.liveBlock).toMatchObject({ type: "listUnordered", raw: "- live item", live: true })
  expect(projection.wholeDocumentFallback).toBe(false)
})

test("keeps parser containers together instead of splitting their children", () => {
  const projection = markdownStreamingProjectionCreate("- one\n  continuation\n\n> quoted\n> text\n\nnext")

  expect(projection.blocks.map((block) => [block.type, block.raw, block.live])).toEqual([
    ["listUnordered", "- one\n  continuation\n\n", false],
    ["blockQuote", "> quoted\n> text\n\n", false],
    ["paragraph", "next", true],
  ])
})

test("invalidates only the parser-uncertain unfinished fenced tail", () => {
  const projection = markdownStreamingProjectionCreate("before\n\n```ts\nconst value = 1")

  expect(projection.stableBlocks).toHaveLength(1)
  expect(projection.stableBlocks[0]).toMatchObject({ type: "paragraph", raw: "before\n\n", live: false })
  expect(projection.liveBlock).toMatchObject({ type: "codeFenced", raw: "```ts\nconst value = 1", live: true })
})

test("falls back when an incomplete list continuation leaves parser semantics uncertain", () => {
  const source = "before\n\n- one\n "
  const projection = markdownStreamingProjectionCreate(source)

  expect(projection).toMatchObject({ wholeDocumentFallback: true, invalidationReason: "parser-uncertainty" })
  expect(projection.liveBlock).toMatchObject({ type: "document", raw: source, live: true })
})

test("makes a closed fenced code block stable at the end", () => {
  const projection = markdownStreamingProjectionCreate("```ts\nconst value = 1\n```")

  expect(projection.stableBlocks).toHaveLength(1)
  expect(projection.stableBlocks[0]).toMatchObject({
    type: "codeFenced",
    raw: "```ts\nconst value = 1\n```",
    live: false,
  })
  expect(projection.liveBlock).toBeUndefined()
})

test("renders a fenced code projection in integration order like the whole document", () => {
  const source = "```ts\nconst value = 1\n```"
  const projection = markdownStreamingProjectionCreate(source)

  expect(projection.wholeDocumentFallback).toBe(false)
  expect(projection.blocks.map((block) => markdownHtmlRender(block.raw)).join("")).toBe(markdownHtmlRender(source))
})

test("renders ordinary projected blocks in integration order like the whole document", () => {
  const source = "# Plan\n\nFinished paragraph.\n\n- one\n- two\n\n> quoted\n> text\n\nFinal paragraph."
  const projection = markdownStreamingProjectionCreate(source)

  expect(projection.wholeDocumentFallback).toBe(false)
  expect(projection.blocks.map((block) => markdownHtmlRender(block.raw)).join("")).toBe(markdownHtmlRender(source))
})

test("makes a terminated list and blockquote stable at the end", () => {
  const listProjection = markdownStreamingProjectionCreate("- one\n\n")
  const blockQuoteProjection = markdownStreamingProjectionCreate("> quoted\n\n")

  expect(listProjection.stableBlocks).toMatchObject([{ type: "listUnordered", raw: "- one\n\n", live: false }])
  expect(listProjection.liveBlock).toBeUndefined()
  expect(blockQuoteProjection.stableBlocks).toMatchObject([{ type: "blockQuote", raw: "> quoted\n\n", live: false }])
  expect(blockQuoteProjection.liveBlock).toBeUndefined()
})

test("falls back to one live document block when reference definitions are present", () => {
  const projection = markdownStreamingProjectionCreate("[docs][id]\n\n[id]: https://example.com")

  expect(projection.wholeDocumentFallback).toBe(true)
  expect(projection.invalidationReason).toBe("reference-definition")
  expect(projection.stableBlocks).toEqual([])
  expect(projection.liveBlock).toMatchObject({ type: "document", raw: projection.source, live: true })
})

test("falls back conservatively for table-like cross-block syntax", () => {
  const projection = markdownStreamingProjectionCreate("| name | value |\n| :--- | ---: |\n| one | two |")

  expect(projection.wholeDocumentFallback).toBe(true)
  expect(projection.invalidationReason).toBe("cross-block-construct")
  expect(projection.blocks).toHaveLength(1)
})

test("does not treat table-like text inside a fenced code block as a table", () => {
  const projection = markdownStreamingProjectionCreate("```md\n| name | value |\n| --- | --- |\n```")

  expect(projection.wholeDocumentFallback).toBe(false)
  expect(projection.stableBlocks).toMatchObject([{ type: "codeFenced", live: false }])
})

test("falls back when an append reinterprets a terminated list and preserves a blockquote continuation", () => {
  const listPreviousSource = "- one\n\n"
  const blockQuotePreviousSource = "before\n\n> quoted\n"
  const listProjection = markdownStreamingProjectionCreate(`${listPreviousSource}  continuation`, {
    previousSource: listPreviousSource,
  })
  const blockQuoteProjection = markdownStreamingProjectionCreate(`${blockQuotePreviousSource}continuation`, {
    previousSource: blockQuotePreviousSource,
  })

  expect(listProjection).toMatchObject({ wholeDocumentFallback: true, invalidationReason: "parser-uncertainty" })
  expect(blockQuoteProjection.wholeDocumentFallback).toBe(false)
  expect(blockQuoteProjection.stableBlocks).toMatchObject([{ type: "paragraph", raw: "before\n\n", live: false }])
  expect(blockQuoteProjection.liveBlock).toMatchObject({ type: "blockQuote", live: true })
})

test("keeps the stable prefix when an append turns a live paragraph into a setext heading", () => {
  const previousSource = "before\n\nTitle\n"
  const projection = markdownStreamingProjectionCreate(`${previousSource}---`, { previousSource })

  expect(projection.wholeDocumentFallback).toBe(false)
  expect(projection.stableBlocks).toMatchObject([
    { type: "paragraph", raw: "before\n\n", live: false },
    { type: "setextHeading", raw: "Title\n---", live: false },
  ])
  expect(projection.liveBlock).toBeUndefined()
})

test("handles character-by-character append-only parsing without reusing changed stable blocks", () => {
  const source = "Intro\n\n- one\n\n> quoted\n\nTitle\n---\n\n"
  let previousSource = ""

  for (let end = 1; end <= source.length; end += 1) {
    const currentSource = source.slice(0, end)
    const projection = markdownStreamingProjectionCreate(currentSource, { previousSource })

    if (projection.wholeDocumentFallback)
      expect(projection.liveBlock).toMatchObject({ type: "document", raw: currentSource, live: true })
    previousSource = currentSource
  }

  const finalProjection = markdownStreamingProjectionCreate(source, { previousSource: source.slice(0, -1) })
  expect(finalProjection.wholeDocumentFallback).toBe(false)
  expect(finalProjection.stableBlocks.map((block) => block.type)).toEqual([
    "paragraph",
    "listUnordered",
    "blockQuote",
    "setextHeading",
  ])
})

test("falls back when the source is not append-only", () => {
  const projection = markdownStreamingProjectionCreate("replacement", { previousSource: "original" })

  expect(projection.wholeDocumentFallback).toBe(true)
  expect(projection.invalidationReason).toBe("non-append")
  expect(projection.liveBlock?.raw).toBe("replacement")
})
