import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { toolErrorCodes } from "../runtime/toolErrorCodes.js"
import type { WebfetchToolInput } from "../schema/webfetchToolInputSchema.js"
import { webfetchToolInputSchema } from "../schema/webfetchToolInputSchema.js"
import type { WebfetchToolOutput } from "../schema/webfetchToolOutputSchema.js"

const WEBFETCH_DEFAULT_OUTPUT_LIMIT = 16_384
const WEBFETCH_DEFAULT_TIMEOUT_MS = 30_000
const WEBFETCH_MAX_OUTPUT_LIMIT = 1_048_576
const WEBFETCH_MAX_RESPONSE_BYTES = 5 * 1_024 * 1_024
const WEBFETCH_MAX_TIMEOUT_MS = 120_000
const WEBFETCH_MAX_CONTENT_TYPE_LENGTH = 512
const WEBFETCH_MAX_URL_LENGTH = 8_192

type WebfetchFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type WebfetchExecuteOptions = {
  fetch?: WebfetchFetch
  maxResponseBytes?: number
  outputLimit?: number
  signal?: AbortSignal
  timeoutMs?: number | null
}

type WebfetchAbortKind = "aborted" | "timeout"

type WebfetchBodyReadResult =
  | { bytes: Uint8Array; type: "complete" }
  | { type: "aborted" }
  | { type: "failed" }
  | { type: "too-large" }

type WebfetchPromiseResult<T> = { type: "complete"; value: T } | { type: "aborted" } | { type: "failed" }

type WebfetchHtmlNode = {
  attributes: Map<string, string>
  children: Array<WebfetchHtmlNode | string>
  name: string
}

const webfetchHtmlVoidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

const webfetchHtmlSkippedElements = new Set([
  "embed",
  "iframe",
  "link",
  "meta",
  "noscript",
  "object",
  "script",
  "style",
])

const webfetchHtmlBlockElements = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "form",
  "header",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
])

const webfetchHtmlEntityMap: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  bull: "•",
  copy: "©",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsaquo: "‹",
  lsquo: "‘",
  mdash: "—",
  nbsp: "\u00a0",
  ndash: "–",
  para: "¶",
  raquo: "»",
  rdquo: "”",
  rsaquo: "›",
  rsquo: "’",
  trade: "™",
  euro: "€",
  gt: ">",
  lt: "<",
  quot: '"',
}

const webfetchDefaultUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"

function webfetchExecuteError(code: string, message: string) {
  return createResultErrorCode("webfetchExecute", message, code)
}

function webfetchExecuteAbortSignalIsValid(signal: unknown): signal is AbortSignal {
  if (typeof signal !== "object" || signal === null) return false
  if (!("aborted" in signal) || typeof signal.aborted !== "boolean") return false
  if (!("addEventListener" in signal) || typeof signal.addEventListener !== "function") return false
  return "removeEventListener" in signal && typeof signal.removeEventListener === "function"
}

function webfetchExecuteBoundedIntegerResolve(
  value: number | null | undefined,
  fallback: number,
  maximum: number,
  nullable = false,
): number | null | undefined {
  if (value === null) return nullable ? null : undefined
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) return undefined
  return resolved
}

function webfetchExecuteUrlResolve(value: string): Result<URL> {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return webfetchExecuteError(toolErrorCodes.invalidUrl, "The webfetch URL is malformed.")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:")
    return webfetchExecuteError(toolErrorCodes.invalidUrl, "The webfetch URL must use HTTP or HTTPS.")
  if (url.username.length > 0 || url.password.length > 0)
    return webfetchExecuteError(toolErrorCodes.invalidUrl, "The webfetch URL must not contain credentials.")
  return createResult(url)
}

function webfetchExecuteMimeResolve(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

function webfetchExecuteMimeIsHtml(mime: string): boolean {
  return mime === "text/html" || mime === "application/xhtml+xml"
}

function webfetchExecuteMimeIsTextual(mime: string): boolean {
  return (
    mime === "" ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime.endsWith("+json") ||
    mime === "application/xml" ||
    mime.endsWith("+xml") ||
    mime === "application/javascript" ||
    mime === "application/x-javascript"
  )
}

function webfetchExecuteAcceptResolve(format: WebfetchToolInput["format"]): string {
  if (format === "text") return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
  if (format === "html")
    return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
  return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
}

function webfetchExecuteHeaderRead(response: Response, name: string): string {
  try {
    const value = response.headers.get(name)
    return value === null ? "" : value
  } catch {
    return ""
  }
}

function webfetchExecuteContentLengthRead(response: Response): number | undefined {
  const value = webfetchExecuteHeaderRead(response, "content-length").trim()
  if (!/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function webfetchExecuteAbortKindResolve(signal: AbortSignal): WebfetchAbortKind {
  return signal.reason === "tool-timeout" ? "timeout" : "aborted"
}

function webfetchExecuteAbortError(signal: AbortSignal) {
  const kind = webfetchExecuteAbortKindResolve(signal)
  return webfetchExecuteError(
    kind === "timeout" ? toolErrorCodes.timeout : toolErrorCodes.aborted,
    kind === "timeout" ? "The webfetch request timed out." : "The webfetch request was aborted.",
  )
}

function webfetchExecutePromiseAwait<T>(promise: Promise<T>, signal: AbortSignal): Promise<WebfetchPromiseResult<T>> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: WebfetchPromiseResult<T>): void => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      resolve(result)
    }
    const onAbort = () => finish({ type: "aborted" })
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
      return
    }
    void promise.then(
      (value) => finish({ type: "complete", value }),
      () => finish({ type: "failed" }),
    )
  })
}

async function webfetchExecuteResponseCancel(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // The response can already be closed when a bound is exceeded.
  }
}

async function webfetchExecuteBodyRead(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<WebfetchBodyReadResult> {
  if (response.body === null) {
    let bodyText: string
    try {
      const text = webfetchExecutePromiseAwait(response.text(), signal)
      const result = await text
      if (result.type === "aborted") return result
      if (result.type === "failed") return result
      bodyText = result.value
    } catch {
      return { type: "failed" }
    }
    const bytes = new TextEncoder().encode(bodyText)
    return bytes.byteLength > maxBytes ? { type: "too-large" } : { bytes, type: "complete" }
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    reader = response.body.getReader()
  } catch {
    return { type: "failed" }
  }

  const chunks: Uint8Array[] = []
  let byteLength = 0
  let cancelPromise: Promise<void> | undefined
  let removeAbortListener: () => void = () => undefined
  const aborted = new Promise<"aborted">((resolve) => {
    const onAbort = () => {
      cancelPromise = reader.cancel().then(
        () => undefined,
        () => undefined,
      )
      resolve("aborted")
    }
    removeAbortListener = () => signal.removeEventListener("abort", onAbort)
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) onAbort()
  })

  try {
    while (true) {
      const read = reader.read()
      void read.catch(() => undefined)
      const next = await Promise.race([read, aborted])
      if (next === "aborted" || signal.aborted) return { type: "aborted" }
      if (next.done) return { bytes: webfetchExecuteBytesCombine(chunks, byteLength), type: "complete" }
      if (!(next.value instanceof Uint8Array)) return { type: "failed" }
      byteLength += next.value.byteLength
      if (byteLength > maxBytes) {
        cancelPromise = reader.cancel().then(
          () => undefined,
          () => undefined,
        )
        return { type: "too-large" }
      }
      chunks.push(next.value.slice())
    }
  } catch {
    return signal.aborted ? { type: "aborted" } : { type: "failed" }
  } finally {
    removeAbortListener()
    if (cancelPromise !== undefined) await cancelPromise
    reader.releaseLock()
  }
}

function webfetchExecuteBytesCombine(chunks: readonly Uint8Array[], byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function webfetchExecuteEntityDecode(value: string): string {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi, (entity, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) {
      const codePoint = Number.parseInt(name.slice(2), 16)
      return Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity
    }
    if (name.startsWith("#")) {
      const codePoint = Number.parseInt(name.slice(1), 10)
      return Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity
    }
    return webfetchHtmlEntityMap[name.toLowerCase()] ?? entity
  })
}

function webfetchExecuteHtmlTagEndResolve(html: string, start: number): number {
  let quote: string | undefined
  for (let index = start; index < html.length; index += 1) {
    const character = html[index]
    if (quote !== undefined) {
      if (character === quote) quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === ">") return index
  }
  return html.length - 1
}

function webfetchExecuteHtmlAttributesParse(source: string): Map<string, string> {
  const attributes = new Map<string, string>()
  let index = 0
  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index] ?? "")) index += 1
    if (index >= source.length || source[index] === "/") break
    const nameStart = index
    while (index < source.length && !/[\s=/>]/.test(source[index] ?? "")) index += 1
    const name = source.slice(nameStart, index).toLowerCase()
    if (name.length === 0) {
      index += 1
      continue
    }
    while (index < source.length && /\s/.test(source[index] ?? "")) index += 1
    let value = ""
    if (source[index] === "=") {
      index += 1
      while (index < source.length && /\s/.test(source[index] ?? "")) index += 1
      const quote = source[index]
      if (quote === '"' || quote === "'") {
        index += 1
        const valueStart = index
        while (index < source.length && source[index] !== quote) index += 1
        value = source.slice(valueStart, index)
        if (index < source.length) index += 1
      } else {
        const valueStart = index
        while (index < source.length && !/[\s>]/.test(source[index] ?? "")) index += 1
        value = source.slice(valueStart, index)
      }
    }
    attributes.set(name, webfetchExecuteEntityDecode(value))
  }
  return attributes
}

function webfetchExecuteHtmlParse(html: string): WebfetchHtmlNode {
  const root: WebfetchHtmlNode = { attributes: new Map(), children: [], name: "root" }
  const stack: WebfetchHtmlNode[] = [root]
  let index = 0
  while (index < html.length) {
    const open = html.indexOf("<", index)
    if (open < 0) {
      stack.at(-1)?.children.push(html.slice(index))
      break
    }
    if (open > index) stack.at(-1)?.children.push(html.slice(index, open))
    if (html.startsWith("<!--", open)) {
      const commentEnd = html.indexOf("-->", open + 4)
      index = commentEnd < 0 ? html.length : commentEnd + 3
      continue
    }
    const close = webfetchExecuteHtmlTagEndResolve(html, open + 1)
    const rawTag = html.slice(open + 1, close).trim()
    index = close + 1
    if (rawTag.length === 0 || rawTag.startsWith("!") || rawTag.startsWith("?")) continue
    if (rawTag.startsWith("/")) {
      const closingName = rawTag.slice(1).trim().split(/\s/, 1)[0]?.toLowerCase()
      if (closingName === undefined) continue
      for (let stackIndex = stack.length - 1; stackIndex > 0; stackIndex -= 1) {
        if (stack[stackIndex]?.name !== closingName) continue
        stack.length = stackIndex
        break
      }
      continue
    }
    const nameMatch = /^([^\s/>]+)/.exec(rawTag)
    if (nameMatch === null) continue
    const name = nameMatch?.[1]?.toLowerCase()
    if (name === undefined) continue
    const attributeSource = rawTag.slice(nameMatch[0].length).replace(/\/\s*$/, "")
    const node: WebfetchHtmlNode = {
      attributes: webfetchExecuteHtmlAttributesParse(attributeSource),
      children: [],
      name,
    }
    stack.at(-1)?.children.push(node)
    if (!webfetchHtmlVoidElements.has(name) && !rawTag.endsWith("/")) stack.push(node)
  }
  return root
}

function webfetchExecuteHtmlTextNormalize(value: string): string {
  return webfetchExecuteEntityDecode(value).replace(/\s+/g, " ")
}

function webfetchExecuteHtmlInline(node: WebfetchHtmlNode | string, preserveWhitespace = false): string {
  if (typeof node === "string")
    return preserveWhitespace ? webfetchExecuteEntityDecode(node) : webfetchExecuteHtmlTextNormalize(node)
  if (webfetchHtmlSkippedElements.has(node.name)) return ""
  if (webfetchHtmlBlockElements.has(node.name)) return webfetchExecuteHtmlNodeRender(node)
  if (node.name === "br") return "\n"
  if (node.name === "img") {
    const alt = node.attributes.get("alt")?.trim() ?? ""
    const source = node.attributes.get("src")?.trim() ?? ""
    return source.length === 0 ? "" : `![${alt}](${source})`
  }
  if (node.name === "code" && node.children.length > 0) {
    const code = node.children
      .map((child) => webfetchExecuteHtmlInline(child, true))
      .join("")
      .replace(/`/g, "\\`")
    return `\`${code}\``
  }
  const containsBlockChild = node.children.some(
    (child) => typeof child !== "string" && webfetchHtmlBlockElements.has(child.name),
  )
  const content = containsBlockChild
    ? webfetchExecuteHtmlChildrenRender(node)
    : node.children.map((child) => webfetchExecuteHtmlInline(child, preserveWhitespace)).join("")
  if (node.name === "strong" || node.name === "b") return content.trim().length === 0 ? "" : `**${content.trim()}**`
  if (node.name === "em" || node.name === "i") return content.trim().length === 0 ? "" : `*${content.trim()}*`
  if (node.name === "del" || node.name === "s" || node.name === "strike")
    return content.trim().length === 0 ? "" : `~~${content.trim()}~~`
  if (node.name === "a") {
    const href = node.attributes.get("href")?.trim() ?? ""
    if (href.length === 0 || /^(?:javascript|data):/i.test(href)) return content
    return content.trim().length === 0 ? "" : `[${content.trim()}](${href})`
  }
  return content
}

function webfetchExecuteHtmlChildrenRender(node: WebfetchHtmlNode): string {
  const containsBlockChild = node.children.some(
    (child) => typeof child !== "string" && webfetchHtmlBlockElements.has(child.name),
  )
  return node.children
    .map((child) => {
      if (containsBlockChild && typeof child === "string" && child.trim().length === 0) return ""
      return webfetchExecuteHtmlNodeRender(child)
    })
    .join("")
}

function webfetchExecuteHtmlListRender(node: WebfetchHtmlNode): string {
  const ordered = node.name === "ol"
  const items = node.children.filter(
    (child): child is WebfetchHtmlNode => typeof child !== "string" && child.name === "li",
  )
  const lines: string[] = []
  for (const [index, item] of items.entries()) {
    const rendered = webfetchExecuteHtmlChildrenRender(item)
      .trim()
      .replace(/\n{3,}/g, "\n\n")
    if (rendered.length === 0) continue
    const itemLines = rendered.split("\n")
    const marker = ordered ? `${index + 1}. ` : "- "
    lines.push(`${marker}${itemLines[0] ?? ""}`)
    for (const line of itemLines.slice(1)) lines.push(`  ${line}`)
  }
  return lines.join("\n")
}

function webfetchExecuteHtmlTableRender(node: WebfetchHtmlNode): string {
  const rows: string[][] = []
  const visit = (candidate: WebfetchHtmlNode): void => {
    if (candidate.name === "tr") {
      const cells = candidate.children
        .filter(
          (child): child is WebfetchHtmlNode =>
            typeof child !== "string" && (child.name === "td" || child.name === "th"),
        )
        .map((cell) => webfetchExecuteHtmlChildrenRender(cell).trim().replace(/\|/g, "\\|"))
      if (cells.length > 0) rows.push(cells)
      return
    }
    for (const child of candidate.children) if (typeof child !== "string") visit(child)
  }
  visit(node)
  if (rows.length === 0) return ""
  const columnCount = Math.max(...rows.map((row) => row.length))
  const paddedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""))
  const renderRow = (row: readonly string[]) => `| ${row.join(" | ")} |`
  const separator = renderRow(Array.from({ length: columnCount }, () => "---"))
  return [renderRow(paddedRows[0] ?? []), separator, ...paddedRows.slice(1).map(renderRow)].join("\n")
}

function webfetchExecuteHtmlPreContentRender(node: WebfetchHtmlNode | string): string {
  if (typeof node === "string") return webfetchExecuteEntityDecode(node)
  if (webfetchHtmlSkippedElements.has(node.name)) return ""
  return node.children.map((child) => webfetchExecuteHtmlPreContentRender(child)).join("")
}

function webfetchExecuteHtmlNodeRender(node: WebfetchHtmlNode | string): string {
  if (typeof node === "string") return webfetchExecuteHtmlTextNormalize(node)
  if (webfetchHtmlSkippedElements.has(node.name)) return ""
  if (node.name === "table") return `${webfetchExecuteHtmlTableRender(node)}\n\n`
  if (node.name === "ul" || node.name === "ol") return `${webfetchExecuteHtmlListRender(node)}\n\n`
  if (node.name === "hr") return "\n\n---\n\n"
  if (node.name === "pre") {
    const content = node.children
      .map((child) => webfetchExecuteHtmlPreContentRender(child))
      .join("")
      .trim()
    return content.length === 0 ? "" : `\n\n\`\`\`\n${content}\n\`\`\`\n\n`
  }
  if (/^h[1-6]$/.test(node.name)) {
    const level = Number(node.name.slice(1))
    const content = webfetchExecuteHtmlChildrenRender(node).trim()
    return content.length === 0 ? "" : `\n\n${"#".repeat(level)} ${content}\n\n`
  }
  if (node.name === "blockquote") {
    const content = webfetchExecuteHtmlChildrenRender(node).trim()
    return content.length === 0
      ? ""
      : `\n\n${content
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}\n\n`
  }
  if (webfetchHtmlBlockElements.has(node.name)) return `\n\n${webfetchExecuteHtmlChildrenRender(node).trim()}\n\n`
  return webfetchExecuteHtmlInline(node)
}

function webfetchExecuteHtmlToMarkdown(html: string): string {
  const root = webfetchExecuteHtmlParse(html)
  return webfetchExecuteHtmlChildrenRender(root)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function webfetchExecuteHtmlToTextNodeRender(node: WebfetchHtmlNode | string): string {
  if (typeof node === "string") return webfetchExecuteHtmlTextNormalize(node)
  if (webfetchHtmlSkippedElements.has(node.name)) return ""
  if (node.name === "br") return "\n"
  const content = node.children.map((child) => webfetchExecuteHtmlToTextNodeRender(child)).join("")
  return webfetchHtmlBlockElements.has(node.name) ? `\n\n${content}\n\n` : content
}

function webfetchExecuteHtmlToText(html: string): string {
  const root = webfetchExecuteHtmlParse(html)
  return webfetchExecuteHtmlToTextNodeRender(root)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function webfetchExecuteOutputSerialize(output: WebfetchToolOutput): string {
  return JSON.stringify(output)
}

function webfetchExecuteOutputFit(
  input: Omit<WebfetchToolOutput, "output" | "truncated"> & { output: string; truncated?: boolean },
  outputLimit: number,
): Result<WebfetchToolOutput> {
  const serialize = (output: string, truncated: boolean): WebfetchToolOutput => ({
    contentType: input.contentType,
    format: input.format,
    output,
    truncated,
    url: input.url,
  })
  const complete = serialize(input.output, input.truncated ?? false)
  if (webfetchExecuteOutputSerialize(complete).length <= outputLimit) return createResult(complete)

  let low = 0
  let high = input.output.length
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2)
    if (webfetchExecuteOutputSerialize(serialize(input.output.slice(0, candidate), true)).length <= outputLimit)
      low = candidate
    else high = candidate - 1
  }
  const bounded = serialize(input.output.slice(0, low), true)
  if (webfetchExecuteOutputSerialize(bounded).length > outputLimit)
    return webfetchExecuteError(
      toolErrorCodes.outputLimit,
      "The webfetch output limit is too small for structured output.",
    )
  return createResult(bounded)
}

function webfetchExecuteOutputCreate(input: {
  content: string
  contentType: string
  format: WebfetchToolInput["format"]
  outputLimit: number
  url: string
}): Result<WebfetchToolOutput> {
  return webfetchExecuteOutputFit(
    {
      contentType: input.contentType.slice(0, WEBFETCH_MAX_CONTENT_TYPE_LENGTH),
      format: input.format,
      output: input.content,
      url: input.url.slice(0, WEBFETCH_MAX_URL_LENGTH),
    },
    input.outputLimit,
  )
}

function webfetchExecuteTimeoutResolve(input: WebfetchToolInput, timeoutMs: number | null): number | null | undefined {
  if (input.timeout !== undefined) {
    const resolved = Math.ceil(input.timeout * 1_000)
    return Number.isSafeInteger(resolved) ? resolved : undefined
  }
  return timeoutMs
}

async function webfetchExecuteRequest(
  input: WebfetchToolInput,
  signal: AbortSignal,
  fetchFunction: WebfetchFetch,
): Promise<Result<Response>> {
  let response: WebfetchPromiseResult<Response>
  try {
    response = await webfetchExecutePromiseAwait(
      fetchFunction(input.url, {
        headers: {
          Accept: webfetchExecuteAcceptResolve(input.format),
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": webfetchDefaultUserAgent,
        },
        redirect: "follow",
        signal,
      }),
      signal,
    )
  } catch {
    return webfetchExecuteError(toolErrorCodes.fetchFailed, "The webfetch request could not be started.")
  }
  if (response.type === "aborted") return webfetchExecuteAbortError(signal)
  if (response.type === "failed") {
    if (signal.aborted) return webfetchExecuteAbortError(signal)
    return webfetchExecuteError(toolErrorCodes.fetchFailed, "The webfetch request failed.")
  }
  return createResult(response.value)
}

async function webfetchExecuteWithLimits(
  input: WebfetchToolInput,
  options: {
    fetch: WebfetchFetch
    maxResponseBytes: number
    signal: AbortSignal
  },
): Promise<Result<{ content: string; contentType: string }>> {
  const response = await webfetchExecuteRequest(input, options.signal, options.fetch)
  if (!response.success) return response
  if (options.signal.aborted) return webfetchExecuteAbortError(options.signal)

  const responseUrl = response.data.url
  if (responseUrl.length > 0) {
    const finalUrl = webfetchExecuteUrlResolve(responseUrl)
    if (!finalUrl.success) {
      await webfetchExecuteResponseCancel(response.data)
      return finalUrl
    }
  }
  if (!response.data.ok) {
    await webfetchExecuteResponseCancel(response.data)
    return webfetchExecuteError(
      toolErrorCodes.httpError,
      `The webfetch request returned HTTP status ${response.data.status}.`,
    )
  }

  const contentType = webfetchExecuteHeaderRead(response.data, "content-type").slice(
    0,
    WEBFETCH_MAX_CONTENT_TYPE_LENGTH,
  )
  const mime = webfetchExecuteMimeResolve(contentType)
  if (!webfetchExecuteMimeIsTextual(mime)) {
    await webfetchExecuteResponseCancel(response.data)
    return webfetchExecuteError(toolErrorCodes.unsupportedContentType, "The fetched content type is not textual.")
  }

  const contentLength = webfetchExecuteContentLengthRead(response.data)
  if (contentLength !== undefined && contentLength > options.maxResponseBytes) {
    await webfetchExecuteResponseCancel(response.data)
    return webfetchExecuteError(toolErrorCodes.responseTooLarge, "The fetched response exceeded the byte limit.")
  }
  const body = await webfetchExecuteBodyRead(response.data, options.maxResponseBytes, options.signal)
  if (body.type === "aborted") return webfetchExecuteAbortError(options.signal)
  if (body.type === "failed")
    return webfetchExecuteError(toolErrorCodes.fetchFailed, "The fetched response could not be read.")
  if (body.type === "too-large")
    return webfetchExecuteError(toolErrorCodes.responseTooLarge, "The fetched response exceeded the byte limit.")

  const decoded = new TextDecoder().decode(body.bytes)
  return createResult({
    content: decoded,
    contentType,
  })
}

export async function webfetchExecute(
  input: unknown,
  options: WebfetchExecuteOptions = {},
): Promise<Result<WebfetchToolOutput>> {
  const parsedInput = v.safeParse(webfetchToolInputSchema, input)
  if (!parsedInput.success) return webfetchExecuteError(toolErrorCodes.invalidInput, "The webfetch input is invalid.")

  const signal = options.signal ?? new AbortController().signal
  if (!webfetchExecuteAbortSignalIsValid(signal))
    return webfetchExecuteError(toolErrorCodes.invalidContext, "The webfetch abort signal is invalid.")
  if (signal.aborted) return webfetchExecuteAbortError(signal)

  const outputLimit = webfetchExecuteBoundedIntegerResolve(
    options.outputLimit,
    WEBFETCH_DEFAULT_OUTPUT_LIMIT,
    WEBFETCH_MAX_OUTPUT_LIMIT,
  )
  const maxResponseBytes = webfetchExecuteBoundedIntegerResolve(
    options.maxResponseBytes,
    WEBFETCH_MAX_RESPONSE_BYTES,
    WEBFETCH_MAX_RESPONSE_BYTES,
  )
  const timeoutCandidate = webfetchExecuteTimeoutResolve(
    parsedInput.output,
    options.timeoutMs === undefined ? WEBFETCH_DEFAULT_TIMEOUT_MS : options.timeoutMs,
  )
  const timeoutMs =
    timeoutCandidate === undefined
      ? undefined
      : webfetchExecuteBoundedIntegerResolve(
          timeoutCandidate,
          WEBFETCH_DEFAULT_TIMEOUT_MS,
          WEBFETCH_MAX_TIMEOUT_MS,
          true,
        )
  if (
    outputLimit === undefined ||
    outputLimit === null ||
    maxResponseBytes === undefined ||
    maxResponseBytes === null ||
    timeoutMs === undefined
  )
    return webfetchExecuteError(toolErrorCodes.invalidContext, "The webfetch execution limits are invalid.")

  const url = webfetchExecuteUrlResolve(parsedInput.output.url)
  if (!url.success) return url

  const fetchFunction =
    options.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined)
  if (fetchFunction === undefined)
    return webfetchExecuteError(toolErrorCodes.fetchFailed, "The webfetch runtime does not provide fetch.")
  const executionController = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const abortFromInput = () => executionController.abort(signal.reason)
  signal.addEventListener("abort", abortFromInput, { once: true })
  if (signal.aborted) abortFromInput()
  if (timeoutMs !== null) timeoutHandle = setTimeout(() => executionController.abort("tool-timeout"), timeoutMs)

  try {
    if (executionController.signal.aborted) return webfetchExecuteAbortError(executionController.signal)
    let fetched: Result<{ content: string; contentType: string }>
    try {
      fetched = await webfetchExecuteWithLimits(parsedInput.output, {
        fetch: fetchFunction,
        maxResponseBytes,
        signal: executionController.signal,
      })
    } catch {
      return webfetchExecuteError(toolErrorCodes.fetchFailed, "The webfetch response was invalid.")
    }
    if (!fetched.success) return fetched
    if (executionController.signal.aborted) return webfetchExecuteAbortError(executionController.signal)

    let content = fetched.data.content
    try {
      if (webfetchExecuteMimeIsHtml(webfetchExecuteMimeResolve(fetched.data.contentType))) {
        if (parsedInput.output.format === "markdown") content = webfetchExecuteHtmlToMarkdown(content)
        if (parsedInput.output.format === "text") content = webfetchExecuteHtmlToText(content)
      }
    } catch {
      return webfetchExecuteError(toolErrorCodes.conversionFailed, "The fetched HTML could not be converted.")
    }
    if (executionController.signal.aborted) return webfetchExecuteAbortError(executionController.signal)
    return webfetchExecuteOutputCreate({
      content,
      contentType: fetched.data.contentType,
      format: parsedInput.output.format,
      outputLimit,
      url: parsedInput.output.url,
    })
  } finally {
    signal.removeEventListener("abort", abortFromInput)
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }
}

export type { WebfetchExecuteOptions, WebfetchFetch }
