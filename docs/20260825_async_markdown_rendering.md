# Async Markdown Rendering

## Goal

Render chat-message Markdown off the UI thread while immediately showing the original Markdown source, then replace that fallback with the rendered HTML without allowing stale streaming results to overwrite newer content.

## Decisions

- Scope the feature to `MessageBody`, which covers both streaming and finalized chat messages; keep notes and project-file previews on the existing synchronous path.
- Reuse `markdownHtmlRender` inside a lazily created module Web Worker so parsing behavior and safety settings remain unchanged.
- Show source as a text node, never as HTML, and preserve whitespace while rendering is pending or if the worker fails.
- Keep the existing `markdown-content markdown-content--message` DOM and styling contract in both fallback and rendered states.
- Use one shared worker bridge with request IDs. Use a component-local content version to ignore stale responses and disposed-component results.
- Treat worker construction, parsing, and transport failures as non-fatal: retain the source fallback and do not surface an error in the message UI.
- Implement the observed OpenCode behavior without importing its block projection, incremental highlighting, or DOM morphing machinery.
- Port and adapt the applicable OpenCode worker transport/protocol test cases rather than relying only on new implementation-specific tests; exclude tests for machinery Codeline will not adopt.

## Approach

- Add a typed worker request/response boundary that runs the existing synchronous renderer in a browser module worker.
- Add a reactive message-body render state that starts with no rendered HTML, requests rendering only on the client, resets immediately to source whenever content changes, and publishes HTML only when the matching latest request succeeds.
- Make `MessageBody` switch between escaped source text and the resulting `innerHTML`, with a fallback modifier that preserves source line breaks.
- Cover the state transition independently from the DOM by injecting a deferred renderer in unit tests. Adapt OpenCode's request ordering, stale-response, queue/error, and fallback cases to Codeline's smaller worker boundary.
- Add an automated browser test against the managed combined preview service that exercises the actual bundled worker and observes source fallback followed by rendered Markdown.

## Tasks

- [x] 1. Add the lazy shared Markdown worker and promise bridge, including typed IDs, response routing, worker-error handling, and safe browser-only initialization.
- [x] 2. Add the reactive latest-content render state and integrate it into `MessageBody` with raw-source fallback styling and disposal protection.
- [x] 3. Port/adapt the relevant OpenCode worker transport and protocol tests, then add Codeline-specific tests for immediate source fallback, successful async replacement, stale-response suppression, rejection fallback, and existing Markdown safety/presentation behavior.
- [x] 4. Add and run an automated real-browser test against the repository-managed combined preview service, proving the bundled worker starts and both streaming and finalized messages transition from source fallback to rendered Markdown; also run single-concurrency unit tests and type/build checks.

## Paths

- `src/markdown/markdownHtmlRender.ts`
- `src/markdown/markdownHtmlRender.worker.ts`
- `src/markdown/markdownHtmlRenderAsync.ts`
- `src/message/ui/messageBodyRenderStateCreate.ts`
- `src/message/ui/MessageBody.tsx`
- `src/markdown/markdown.css`
- `test/messageBodyRenderStateCreate.test.ts`
- `test/messageBodyPresentation.test.ts`
- `test/finalizedMessageHtmlRender.test.ts`
- `e2e/lunaSubagentThread.spec.ts`
- `e2e/asyncMarkdownRendering.spec.ts`
- `~/opensource/opencode/packages/session-ui/src/components/markdown-worker-transport.test.ts`
- `~/opensource/opencode/packages/session-ui/src/components/markdown-worker-queue.test.ts`
- `~/opensource/opencode/packages/session-ui/src/components/markdown-worker-protocol.test.ts`
