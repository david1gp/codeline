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

test("message fallback presents source as text with preserved whitespace", async () => {
  const component = await Bun.file(new URL("../src/message/ui/MessageBody.tsx", import.meta.url)).text()
  const stylesheet = await Bun.file(new URL("../src/markdown/markdown.css", import.meta.url)).text()

  expect(component).toContain("markdown-content markdown-content--message markdown-content--message-fallback")
  expect(component).toContain("{props.content}")
  expect(component).not.toContain("innerHTML={props.content}")
  expect(stylesheet).toContain(".markdown-content--message-fallback")
  expect(stylesheet).toContain("white-space: pre-wrap")
})
