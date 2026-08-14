import { expect, test } from "bun:test"
import { markdownHtmlRender } from "../src/markdown/markdownHtmlRender.js"

test("message Markdown preserves paragraph line breaks without preserving inter-block whitespace", async () => {
  const html = markdownHtmlRender("First line\nsecond line\n\nNext paragraph\n\n```ts\nconst answer = 42\n```")
  const stylesheet = await Bun.file(new URL("../src/markdown/markdown.css", import.meta.url)).text()

  expect(html).toBe(
    '<p>First line\nsecond line</p>\n<p>Next paragraph</p>\n<pre><code class="language-ts">const answer = 42\n</code></pre>',
  )
  expect(stylesheet).toContain(".markdown-content p")
  expect(stylesheet).toContain("white-space: pre-wrap")
  expect(stylesheet).toContain(".markdown-content pre")
  expect(stylesheet).toContain("white-space: pre")
})

test("message Markdown safely renders partial streaming content", () => {
  expect(markdownHtmlRender("Working **on it")).toBe("<p>Working **on it</p>")
})
