import { expect, test } from "bun:test"
import { markdownHtmlRender } from "../src/markdown/markdownHtmlRender.js"

test("finalized messages render Markdown and fenced code", () => {
  const html = markdownHtmlRender("First line\nsecond line with **bold**.\n\n```ts\nconst answer = 42\n```")

  expect(html).toContain("First line\nsecond line with <strong>bold</strong>.")
  expect(html).toContain('<pre><code class="language-ts">const answer = 42\n</code></pre>')
})

test("finalized messages sanitize raw HTML", () => {
  const html = markdownHtmlRender(
    '<script>globalThis.compromised = true</script><img src="x" onerror="globalThis.compromised = true">\n\n[unsafe](javascript:alert(1))',
  )

  expect(html).not.toContain("<script")
  expect(html).not.toContain("<img")
  expect(html).toContain("&lt;script&gt;")
  expect(html).toContain("onerror=&quot;")
  expect(html).toContain('<a href="">unsafe</a>')
})
