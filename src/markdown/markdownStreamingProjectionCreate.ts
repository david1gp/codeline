import { parse, postprocess, preprocess } from "micromark"
import type { Token } from "micromark-util-types"

type MarkdownStreamingProjectionOptions = {
  appendOnly?: boolean
  previousSource?: string
}

type MarkdownStreamingProjectionBlock = {
  id: string
  type: string
  raw: string
  start: number
  end: number
  live: boolean
}

type MarkdownStreamingProjectionInvalidation =
  | "cross-block-construct"
  | "non-append"
  | "parser-uncertainty"
  | "reference-definition"

type MarkdownStreamingProjectionRoot = {
  type: string
  start: number
  end: number
  childTypes: string[]
  semanticSignature: string
}

type MarkdownStreamingProjectionRange = {
  start: number
  end: number
}

type MarkdownStreamingProjectionDraft = {
  roots: MarkdownStreamingProjectionRoot[]
  source: string
  blocks: MarkdownStreamingProjectionBlock[]
  stableBlocks: MarkdownStreamingProjectionBlock[]
  liveBlock: MarkdownStreamingProjectionBlock | undefined
}

type MarkdownStreamingProjectionDraftResult =
  | MarkdownStreamingProjectionDraft
  | { invalidationReason: MarkdownStreamingProjectionInvalidation }

const markdownStreamingProjectionIgnoredRootTypes = new Set([
  "chunkDocument",
  "chunkFlow",
  "chunkText",
  "lineEnding",
  "lineEndingBlank",
  "linePrefix",
  "lineSuffix",
  "space",
  "whitespace",
])

const markdownStreamingProjectionProtectedRangeTypes = new Set(["codeFenced", "codeIndented", "htmlFlow"])

const markdownStreamingProjectionRootTypes = new Set([
  "atxHeading",
  "blockQuote",
  "codeFenced",
  "codeIndented",
  "content",
  "htmlFlow",
  "listOrdered",
  "listUnordered",
  "setextHeading",
  "thematicBreak",
])

function markdownStreamingProjectionFallback(
  source: string,
  invalidationReason: MarkdownStreamingProjectionInvalidation,
) {
  const liveBlock = markdownStreamingProjectionBlockCreate("document", source, 0, source.length, true)
  return {
    source,
    blocks: [liveBlock],
    stableBlocks: [],
    liveBlock,
    wholeDocumentFallback: true,
    invalidationReason,
  }
}

function markdownStreamingProjectionBlockCreate(
  type: string,
  source: string,
  start: number,
  end: number,
  live: boolean,
): MarkdownStreamingProjectionBlock {
  return { id: `${type}:${start}`, type, raw: source.slice(start, end), start, end, live }
}

function markdownStreamingProjectionOffsetResolve(token: Token, sourceLength: number) {
  const start = token.start.offset
  const end = token.end.offset
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return undefined
  if (start < 0 || end < start || end > sourceLength) return undefined
  return { start, end }
}

function markdownStreamingProjectionRootsParse(
  source: string,
):
  | { roots: MarkdownStreamingProjectionRoot[]; protectedRanges: MarkdownStreamingProjectionRange[] }
  | { invalidationReason: "parser-uncertainty" | "reference-definition" } {
  let events: ReturnType<typeof postprocess>
  try {
    const parser = parse()
    events = postprocess(parser.document().write(preprocess()(source, "utf8", true)))
  } catch {
    return { invalidationReason: "parser-uncertainty" }
  }
  const roots: MarkdownStreamingProjectionRoot[] = []
  const protectedRanges: MarkdownStreamingProjectionRange[] = []
  let depth = 0
  let currentRoot: MarkdownStreamingProjectionRoot | undefined

  for (const event of events) {
    const [kind, token] = event
    if (token.type === "definition") return { invalidationReason: "reference-definition" }

    if (kind === "enter") {
      if (markdownStreamingProjectionProtectedRangeTypes.has(token.type)) {
        const offset = markdownStreamingProjectionOffsetResolve(token, source.length)
        if (offset === undefined) return { invalidationReason: "parser-uncertainty" }
        protectedRanges.push(offset)
      }
      if (depth === 0) {
        if (markdownStreamingProjectionIgnoredRootTypes.has(token.type)) {
          currentRoot = undefined
        } else {
          if (!markdownStreamingProjectionRootTypes.has(token.type)) return { invalidationReason: "parser-uncertainty" }
          const offset = markdownStreamingProjectionOffsetResolve(token, source.length)
          if (offset === undefined) return { invalidationReason: "parser-uncertainty" }
          currentRoot = { type: token.type, ...offset, childTypes: [], semanticSignature: `enter:${token.type}` }
          roots.push(currentRoot)
        }
      } else if (depth === 1 && currentRoot !== undefined) {
        currentRoot.childTypes.push(token.type)
      }
      if (depth > 0 && currentRoot !== undefined) currentRoot.semanticSignature += `|enter:${token.type}`
      depth += 1
      continue
    }

    if (depth === 0) return { invalidationReason: "parser-uncertainty" }
    if (currentRoot !== undefined) currentRoot.semanticSignature += `|exit:${token.type}`
    depth -= 1
    if (depth === 0) currentRoot = undefined
  }

  if (depth !== 0) return { invalidationReason: "parser-uncertainty" }
  let previousEnd = 0
  for (const root of roots) {
    if (root.start < previousEnd || root.end < previousEnd) return { invalidationReason: "parser-uncertainty" }
    if (root.type === "content" && root.childTypes.length !== 1) return { invalidationReason: "parser-uncertainty" }
    if (root.type === "content" && root.childTypes[0] !== "paragraph")
      return { invalidationReason: "parser-uncertainty" }
    previousEnd = root.end
  }
  return { roots, protectedRanges }
}

function markdownStreamingProjectionTypeResolve(root: MarkdownStreamingProjectionRoot) {
  if (root.type !== "content") return root.type
  if (root.childTypes.includes("paragraph")) return "paragraph"
  return root.type
}

function markdownStreamingProjectionBlankLineAfterResolve(source: string, end: number) {
  return /(?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)/.test(source.slice(end))
}

function markdownStreamingProjectionLinesCreate(source: string) {
  const lines: { text: string; start: number; end: number }[] = []
  const sourceLines = source.split(/\r\n|\r|\n/)
  let offset = 0
  for (const text of sourceLines) {
    const end = offset + text.length
    lines.push({ text, start: offset, end })
    const lineEnding = source.slice(end).match(/^\r\n|^\r|^\n/)?.[0]
    offset = end + (lineEnding?.length ?? 0)
  }
  return lines
}

function markdownStreamingProjectionLineProtectedResolve(
  line: { start: number; end: number },
  protectedRanges: MarkdownStreamingProjectionRange[],
) {
  return protectedRanges.some((range) => range.start < line.end && range.end > line.start)
}

function markdownStreamingProjectionTableDelimiter(line: string) {
  const trimmed = line.trim()
  if (!trimmed.includes("|")) return false
  const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|")
  return cells.length > 1 && cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()))
}

function markdownStreamingProjectionTableLike(source: string, protectedRanges: MarkdownStreamingProjectionRange[]) {
  const lines = markdownStreamingProjectionLinesCreate(source)
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const header = lines[index]
    const delimiter = lines[index + 1]
    if (
      header !== undefined &&
      delimiter !== undefined &&
      !markdownStreamingProjectionLineProtectedResolve(header, protectedRanges) &&
      !markdownStreamingProjectionLineProtectedResolve(delimiter, protectedRanges) &&
      header.text.includes("|") &&
      markdownStreamingProjectionTableDelimiter(delimiter.text)
    )
      return true
  }
  return false
}

function markdownStreamingProjectionTrailingBlockComplete(root: MarkdownStreamingProjectionRoot, source: string) {
  if (root.type === "atxHeading" || root.type === "setextHeading" || root.type === "thematicBreak") return true
  if (root.type === "codeFenced") return root.childTypes.filter((type) => type === "codeFencedFence").length > 1
  if (
    root.type === "content" ||
    root.type === "codeIndented" ||
    root.type === "htmlFlow" ||
    root.type === "listOrdered" ||
    root.type === "listUnordered" ||
    root.type === "blockQuote"
  )
    return markdownStreamingProjectionBlankLineAfterResolve(source, root.end)
  return false
}

function markdownStreamingProjectionProjectionCreate(source: string): MarkdownStreamingProjectionDraftResult {
  const parsed = markdownStreamingProjectionRootsParse(source)
  if ("invalidationReason" in parsed) return parsed
  if (markdownStreamingProjectionTableLike(source, parsed.protectedRanges))
    return { invalidationReason: "cross-block-construct" as const }

  if (parsed.roots.length === 0) {
    const liveBlock = markdownStreamingProjectionBlockCreate("document", source, 0, source.length, true)
    return {
      roots: parsed.roots,
      source,
      blocks: [liveBlock],
      stableBlocks: [],
      liveBlock,
    }
  }

  const blocks = parsed.roots.map((root, index) => {
    const nextRoot = parsed.roots[index + 1]
    const start = index === 0 ? 0 : root.start
    const end = nextRoot?.start ?? source.length
    const live = index === parsed.roots.length - 1 && !markdownStreamingProjectionTrailingBlockComplete(root, source)
    return markdownStreamingProjectionBlockCreate(
      markdownStreamingProjectionTypeResolve(root),
      source,
      start,
      end,
      live,
    )
  })
  const stableBlocks = blocks.filter((block) => !block.live)
  const liveBlock = blocks.find((block) => block.live)
  return {
    roots: parsed.roots,
    source,
    blocks,
    stableBlocks,
    liveBlock,
  }
}

function markdownStreamingProjectionRootEqual(
  previous: MarkdownStreamingProjectionRoot | undefined,
  current: MarkdownStreamingProjectionRoot | undefined,
) {
  if (previous === undefined || current === undefined) return false
  return (
    previous.type === current.type &&
    previous.start === current.start &&
    previous.end === current.end &&
    previous.childTypes.join("\u0000") === current.childTypes.join("\u0000") &&
    previous.semanticSignature === current.semanticSignature
  )
}

function markdownStreamingProjectionBlockRawEqual(
  previous: MarkdownStreamingProjectionBlock,
  current: MarkdownStreamingProjectionBlock,
  index: number,
  previousProjection: MarkdownStreamingProjectionDraft,
) {
  if (previous.raw === current.raw) return true
  if (index !== previousProjection.blocks.length - 1 || !current.raw.startsWith(previous.raw)) return false
  return /^[ \t\r\n]+$/.test(current.raw.slice(previous.raw.length))
}

function markdownStreamingProjectionStableReuseSafe(
  previous: MarkdownStreamingProjectionDraft,
  current: MarkdownStreamingProjectionDraft,
) {
  for (let index = 0; index < previous.stableBlocks.length; index += 1) {
    const previousBlock = previous.stableBlocks[index]
    const currentBlock = current.blocks[index]
    if (
      previousBlock === undefined ||
      currentBlock === undefined ||
      currentBlock.live ||
      previousBlock.id !== currentBlock.id ||
      previousBlock.type !== currentBlock.type ||
      !markdownStreamingProjectionBlockRawEqual(previousBlock, currentBlock, index, previous) ||
      previousBlock.start !== currentBlock.start ||
      !markdownStreamingProjectionRootEqual(previous.roots[index], current.roots[index])
    )
      return false
  }
  return true
}

function markdownStreamingProjectionPublicCreate(projection: MarkdownStreamingProjectionDraft) {
  return {
    source: projection.source,
    blocks: projection.blocks,
    stableBlocks: projection.stableBlocks,
    liveBlock: projection.liveBlock,
    wholeDocumentFallback: false,
    invalidationReason: undefined,
  }
}

export function markdownStreamingProjectionCreate(source: string, options: MarkdownStreamingProjectionOptions = {}) {
  if (options.appendOnly === false) return markdownStreamingProjectionFallback(source, "non-append")
  if (options.previousSource !== undefined && !source.startsWith(options.previousSource))
    return markdownStreamingProjectionFallback(source, "non-append")

  const current = markdownStreamingProjectionProjectionCreate(source)
  if ("invalidationReason" in current) return markdownStreamingProjectionFallback(source, current.invalidationReason)

  if (options.previousSource !== undefined) {
    const previous = markdownStreamingProjectionProjectionCreate(options.previousSource)
    if ("invalidationReason" in previous)
      return markdownStreamingProjectionFallback(source, previous.invalidationReason)
    if (!markdownStreamingProjectionStableReuseSafe(previous, current))
      return markdownStreamingProjectionFallback(source, "parser-uncertainty")
  }

  return markdownStreamingProjectionPublicCreate(current)
}
