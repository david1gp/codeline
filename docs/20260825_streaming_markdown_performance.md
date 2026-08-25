# Streaming Markdown performance

## Goal

Reduce wasted Markdown work during streamed message updates while preserving complete Markdown correctness and the existing visible source fallback.

## Decisions

- Apply optimization only to append-only streamed messages; arbitrary note and project edits keep whole-document rendering.
- Schedule rendering per message consumer: allow one in-flight render and retain only the newest pending source.
- Always parse the newest source completely enough to derive valid Markdown structure; never split source on blank lines.
- Derive stable completed blocks and one live trailing block from a Markdown lexer/parser.
- Cache rendered stable blocks by owner identity, block identity/type, raw-content hash, and renderer version.
- Reuse blocks only while updates are proven append-only and no document-wide construct invalidates earlier output; otherwise render the whole document.
- Keep the existing shared worker, request/version guards, safe `micromark` options, failure behavior, and source fallback.
- Preserve stable rendered blocks in the DOM where practical; defer morphdom, incremental Shiki, and worker pools.
- Adapt test cases and patterns from the MIT-licensed OpenCode and T3 Code repositories rather than copying their coupled implementations.
- Put correctness, queue, projection, and cache coverage in unit tests; retain one browser smoke test for real worker bundling and visible integration.

## Approach

- Introduce a pure latest-only scheduler owned by each message render state.
- Introduce a pure streaming projection/cache layer that identifies stable blocks and the live tail using parser-derived boundaries.
- Render and cache completed blocks independently while repeatedly rendering only the live tail.
- Invalidate and fall back to whole-document rendering for non-append changes, reference definitions, unsupported cross-block constructs, parser uncertainty, or renderer-version changes.
- Keep transport concerns separate from projection/cache policy so most behavior is testable without a browser.

## Tasks

- [x] 1. Define message streaming identity and append-only eligibility at the message render-state boundary.
- [x] 2. Implement parser-derived stable/live projection and bounded block-cache primitives.
- [x] 3. Implement a per-consumer latest-only scheduler with one in-flight and one newest pending request.
- [x] 4. Integrate scheduling and block reuse into streamed message rendering, including conservative whole-document fallback.
- [x] 5. Add unit tests adapted from OpenCode worker queue/projection cases and T3 Code LRU patterns, including fences, lists, blockquotes, tables, reference definitions, character-by-character streaming, non-append edits, eviction, disposal, and stale responses.
- [x] 6. Keep and narrow the browser coverage to a managed-preview smoke test proving bundled-worker execution, source fallback, and final visible Markdown.
- [x] 7. Verify focused tests with concurrency 1, then the combined repository-managed preview service and Markdown smoke test.

## Paths

- `src/markdown/markdownHtmlRenderAsync.ts`
- `src/markdown/markdownHtmlRender.worker.ts`
- `src/markdown/markdownHtmlRender.ts`
- `src/markdown/markdownLatestOnlySchedulerCreate.ts`
- `src/markdown/markdownStreamingProjectionCreate.ts`
- `src/markdown/markdownBlockCacheCreate.ts`
- `src/message/ui/messageBodyRenderStateCreate.ts`
- `src/message/ui/MessageBody.tsx`
- `test/markdownHtmlRenderAsync.test.ts`
- `test/markdownLatestOnlySchedulerCreate.test.ts`
- `test/markdownStreamingProjectionCreate.test.ts`
- `test/markdownBlockCacheCreate.test.ts`
- `test/messageBodyRenderStateCreate.test.ts`
- `e2e/asyncMarkdownRendering.spec.ts`
- `~/opensource/opencode/packages/session-ui/src/components/markdown-worker-queue.test.ts`
- `~/opensource/opencode/packages/session-ui/src/components/markdown-worker-protocol.test.ts`
- `~/opensource/opencode/packages/session-ui/src/components/markdown-stream.ts`
- `~/opensource/t3code/apps/web/src/lib/lruCache.test.ts`
