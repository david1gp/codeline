# Notes Markdown Syntax Highlighting

## Goal

Assess whether `/notes` can offer Markdown syntax highlighting with the current libraries, estimate implementation difficulty, and recommend an approach.

## Decisions

- Preserve the existing string-based note model and Zero persistence boundary.
- Treat transitive highlighting packages as unavailable for a durable implementation unless promoted to direct dependencies.
- Offer three icon-based modes: Edit, Preview, and side-by-side Edit + Preview.
- Place mode controls beside the delete action on existing notes and in the equivalent header area on new notes.
- Persist the selected mode locally across note pages.
- Derive the page title from the first content line, truncate it to 50 characters, and debounce reactive title updates; use `New Note` when content is empty.
- Add a left-arrow icon to the Back to notes link.
- Use an accessible icon-button fieldset patterned after `../zitadel-login/client/src/preferences/ui/ThemeToggle.tsx`.
- Use one global note view-mode storage key; default to Edit if storage is missing or invalid.
- Make side-by-side mode responsive by stacking the editor and preview on narrow screens.

## Approach

- Inspect the `/notes` editor implementation and dependency stack.
- Identify existing Markdown, editor, and highlighting capabilities.
- Compare the smallest viable implementation options and recommend one.

## Tasks

1. [x] Locate and assess the `/notes` editing path and current dependencies.
2. [x] Evaluate implementation options, effort, and tradeoffs.
3. [x] Produce a concise recommendation.
4. [x] Add a CommonMark Edit/Preview toggle to new and existing notes.
5. [x] Assess the three-way switcher reference and current note header integration points.
6. [x] Implement the three modes, local persistence, dynamic title, and back icon.
7. [x] Format, create semantic commits containing only note Markdown UI changes, and push.

## Paths

- `docs/20260813_notes-markdown-syntax-highlighting.md`
- `src/note/ui/NotePage.tsx`
- `src/note/ui/NewNotePage.tsx`
- `src/note/ui/notePageStateCreate.ts`
- `src/note/ui/newNotePageStateCreate.ts`
- `src/note/ui/NoteContentField.tsx`
- `src/note/ui/noteContentFieldStateCreate.ts`
- `src/message/ui/finalizedMessageHtmlRender.ts`
- `package.json`
- `../zitadel-login`
- `../zitadel-login/client/src/preferences/ui/ThemeToggle.tsx`

## Task 2: Option Evaluation

### Capability boundaries

- **Editor-source highlighting** colors Markdown punctuation and constructs while the raw Markdown remains editable. A native `textarea` cannot style individual ranges, so this requires either a synchronized visual backdrop or replacing the editing control.
- **Rendered preview** converts Markdown to semantic HTML. It can sit beside, below, or instead of the editor, but it does not highlight the Markdown source.
- **Fenced code-block highlighting** colors the programming language inside rendered ` ```lang ` blocks. It is a preview concern and does not by itself color Markdown source or code fences while editing.

The current `/notes` path is a controlled native `textarea` backed by a string signal. Both create and edit flows receive the complete string on `input`; persistence also remains a string. None of the options requires a note schema or Zero boundary change.

### Editor-source highlighting options

| Option | Current dependency position | Solid integration | Accessibility | Bundle / maintenance cost | Rough implementation effort | Principal tradeoffs |
| --- | --- | --- | --- | --- | --- | --- |
| Keep the native `textarea`; add no source coloring | No dependency | None | Preserves native keyboard, selection, IME, spellcheck, forms, labels, and screen-reader behavior | None | XS: no editor work | Establishes the baseline only; a separate preview can still be added, but this does not satisfy source highlighting. |
| Native `textarea` over a synchronized highlighted backdrop | `micromark` is direct and exposes positional token events. `highlight.js` has a Markdown grammar but is only transitive through `@tanstack/ai-solid-ui` and would need promotion before direct use. | Solid signals can update the backdrop; refs/listeners must synchronize scroll, size, wrapping, tabs, and typography | The textarea can remain the sole accessible/editable control and the duplicate backdrop must be hidden from assistive technology. Visual caret/selection, forced-colors, zoom, IME, mobile scrolling, and browser text rendering need testing. | Low parser cost if reusing `micromark`; low-to-medium incremental parser cost if promoting narrowly imported `highlight.js`. Custom range-to-DOM and synchronization code becomes application-owned maintenance. | M–L: about 3–6 days for robust create/edit parity and interaction testing | Least semantic disruption, but exact overlay alignment is fragile. `micromark` tokens are accurate CommonMark tokens, not a ready-made editor theme; converting nested token events into non-overlapping styled ranges is custom work. Re-parsing the full note on each input also needs debounce/size policy consideration. |
| Replace the textarea with a direct CodeMirror 6 integration using `@codemirror/lang-markdown` | Not present in the project manifest, lockfile, or installed tree; would require direct editor/state/view/language dependencies | Framework-neutral imperative mount/update/destroy fits Solid lifecycle without requiring a wrapper. Transactions must remain synchronized with the existing string signal and form state. | CodeMirror has mature keyboard/selection/editor semantics, but it replaces a native textarea with a `contenteditable` editor. Labeling, focus, screen-reader announcements, high contrast, mobile, IME, and submit behavior require explicit verification. | Medium. Modular imports can limit scope, but this adds an editor subsystem and coordinated package versions. A broad local reference bundle in `piclaw` is 1,413,478 bytes uncompressed and includes many languages/features, so it is an upper bound, not a minimal Codeline estimate. | M: about 2–4 days for basic source highlighting and state parity; more for accessibility/browser hardening | Purpose-built incremental parsing, decorations, selection, undo, and large-document behavior reduce custom editor logic. It changes the editing surface and introduces the largest new maintained subsystem among the focused options. Nested fenced-language coloring requires language registration/loading beyond Markdown itself. |
| Replace the textarea with a custom controlled `contenteditable` using `micromark` decorations | `micromark` is direct; no editor dependency | DOM reconciliation, selection restoration, input events, and composition handling must be custom-integrated with Solid | Highest risk: caret and selection stability, IME, paste, undo, screen-reader behavior, and semantic labeling all become application responsibilities | Nominally low dependency cost but high application maintenance cost | L–XL: about 5–10+ days before broad interaction hardening | Avoids a new editor package but recreates core editor behavior. Re-rendering highlighted spans can disturb selection and composition. |
| Replace the textarea with Monaco | Not present; would require direct dependencies and worker/build configuration | Imperative integration is possible; no current Solid adapter is present | Mature editor features, but it is a complex non-native control requiring the same labeling, screen-reader, mobile, and high-contrast validation | High bundle, worker, build, and upgrade cost for a note editor | L: about 4–8 days including build and accessibility validation | Strong IDE surface and Markdown tokenization, but substantially more infrastructure than source coloring requires. |

Using the transitive `highlight.js` Markdown grammar directly inside the textarea is not possible: it emits highlighted output rather than providing editing behavior. It only becomes an editor-source option when paired with the backdrop or custom `contenteditable` approaches.

### Rendered preview options

| Option | Current dependency position | Solid / accessibility characteristics | Bundle / maintenance cost | Rough implementation effort | Principal tradeoffs |
| --- | --- | --- | --- | --- | --- |
| Existing direct `micromark` renderer | Direct dependency and already used by finalized messages with dangerous HTML and protocols disabled | A memoized HTML result can be rendered from a Solid string. Semantic HTML is generally screen-reader friendly; an edit/preview toggle or split view still needs an accessible name, focus policy, and status behavior. | Lowest incremental dependency cost; application owns preview styling. | S: about 0.5–1.5 days for a basic preview surface | CommonMark rendering is available now. It does not syntax-highlight fenced code, and source and preview scroll/selection are independent. |
| Public `TextPart` export from `@tanstack/ai-solid-ui` | The package is direct. Its local source publicly exports `TextPart`, which uses `solid-markdown`, GFM, raw parsing, `rehype-highlight`, then sanitization. Those nested libraries remain transitive and should not be imported directly. | Native Solid component integration. Output is semantic rendered content; the surrounding preview mode still needs accessible control/focus design. | Low incremental install cost because the direct package already owns the stack, but notes become coupled to a chat-oriented component API and its default plugin policy. The default highlighter imports the `lowlight` common-language set. | S: about 1–2 days for preview integration and styling validation | Adds GFM and fenced code highlighting together. Defaults and sanitization are controlled by the AI UI package; note-specific rendering behavior would need component/plugin configuration and upgrade checks. |
| Promote `solid-markdown` and selected unified plugins to direct dependencies | Currently transitive through `@tanstack/ai-solid-ui`; direct use is not durable without promotion | Native Solid component with explicit plugin ownership | Medium dependency and plugin-pipeline maintenance; allows note-specific sanitizer and feature policy | M: about 2–4 days | More control than `TextPart`, but duplicates ownership of a rendering stack when direct `micromark` already handles basic preview. |

Preview HTML must remain sanitized. The existing `micromark` call disables dangerous HTML and protocols; the inspected `TextPart` default pipeline runs `rehype-sanitize` after raw parsing and highlighting. Disabling those defaults would transfer sanitization responsibility to Codeline.

### Fenced code-block highlighting options

| Option | Current dependency position | Bundle / maintenance cost | Rough implementation effort | Principal tradeoffs |
| --- | --- | --- | --- | --- |
| No code coloring; render `<pre><code>` from `micromark` | Direct and current | None beyond CSS | XS | Preserves code and language classes as rendered Markdown but provides no token colors. |
| Use the direct package's `TextPart` defaults | Public API of direct `@tanstack/ai-solid-ui`; implementation uses transitive `rehype-highlight` → `lowlight` → `highlight.js` | Low incremental installation cost; default common language set and package policy determine coverage | S: included in the 1–2 day preview estimate | Local source confirms only `pre > code` is highlighted; unknown languages are left unhighlighted with a file message. This does not color source editing. |
| Promote `rehype-highlight`/`lowlight` or `highlight.js` and register only required languages | Present only transitively; promotion is required | Low-to-medium when core plus selected grammars are used; Codeline owns aliases, language coverage, CSS theme, and upgrades | M: about 1–3 additional days within a custom preview pipeline | Deterministic client-side highlighting and narrower language scope, but requires an AST/unified renderer or safe highlighted-node integration rather than a simple `micromark` HTML string. |
| Add Shiki | Not present | High relative bundle/data cost unless themes and languages are explicitly lazy-loaded; async initialization and worker/server strategy add maintenance | M–L: about 2–5 additional days | High-fidelity TextMate highlighting and broad language quality, but it is preview-only here and materially increases loading/initialization complexity. |

### Durable decisions from the evaluation

- Preserve the existing string signal and Zero persistence boundary for every option.
- Treat source highlighting, rendered preview, and fenced code highlighting as separate capabilities with separate acceptance criteria.
- Do not import `highlight.js`, `lowlight`, `rehype-highlight`, `solid-markdown`, or unified packages from their current transitive installation. Either consume behavior through the public `@tanstack/ai-solid-ui` API or promote each directly used package.
- Keep one authoritative editable surface. Any textarea backdrop must be non-interactive and hidden from assistive technology; a rendered preview must not become a second editor.
- Require keyboard, screen-reader labeling, IME/composition, mobile, zoom, forced-colors/high-contrast, long-note, undo, paste, and form-submit checks before considering an editor replacement or overlay complete.
- Bundle figures in this evaluation are directional. Installed package sizes and the broad local CodeMirror reference artifact are not production-gzip measurements for Codeline.

### Blockers and unknowns

- No note-specific Markdown dialect is defined. Current finalized messages use CommonMark `micromark`, while `TextPart` enables GFM; expected tables, task lists, autolinks, raw HTML, and fenced-language aliases must be specified before parity can be judged.
- No supported fenced-code language list or loading policy is defined.
- No target browser/assistive-technology matrix or minimum note-size performance target is recorded.
- No minimal CodeMirror or Shiki production bundle was built, because task 2 excludes package installation and implementation. Their exact route-level cost remains unverified.
- The desired interaction is unspecified: always-highlighted source, edit/preview toggle, split preview, or both. These are not equivalent scopes.

## Task 3: Recommendation

### Does the current stack support Markdown syntax highlighting for `/notes`?

Partially, and the answer depends on which of the three capabilities is meant.

- **Rendered preview: yes, today.** `micromark` is already a direct dependency and is already used safely for finalized messages (`src/message/ui/finalizedMessageHtmlRender.ts`). No new package is needed.
- **Fenced code coloring: yes, but only through a direct package's public API.** `@tanstack/ai-solid-ui` is direct and publicly exports `TextPart`, which brings GFM plus `rehype-highlight` behavior. Its highlighting dependencies are transitive and must not be imported directly.
- **Editor-source highlighting (colored Markdown while typing): no.** Nothing in the current stack provides it. The native `textarea` cannot style ranges, so this requires either a custom synchronized backdrop or replacing the editing control with CodeMirror. Both are new, application-owned surface area.

### Difficulty by interpretation

| Interpretation | Verdict | Effort | New direct dependencies |
| --- | --- | --- | --- |
| Rendered preview (CommonMark) | Ship now | S (0.5–1.5 d) | None |
| Preview + fenced code colors via `TextPart` | Ship next | S (1–2 d) | None (public API of a direct package) |
| Preview with note-owned plugin/sanitizer policy | Defer | M (2–4 d) | `solid-markdown` + unified plugins |
| Source highlighting via textarea backdrop | Defer | M–L (3–6 d) | Possibly `highlight.js` promotion |
| Source highlighting via CodeMirror 6 | Defer until demanded | M+ (2–4 d, more for a11y) | `@codemirror/*` + `@codemirror/lang-markdown` |
| Custom `contenteditable` / Monaco | Reject | L–XL | Various |

The `contenteditable` route is rejected because it recreates caret, IME, undo, and paste semantics that the platform already provides. Monaco is rejected as disproportionate infrastructure for a note field.

### Recommended incremental path

1. **Step 1 (now): CommonMark preview on existing `micromark`.** Highest value per unit of risk, zero dependency change, reuses an already-reviewed sanitization posture, and leaves the `textarea` as the single accessible editable control.
2. **Step 2 (only if code notes are common): swap the preview renderer to `TextPart`.** This adds GFM and fenced code colors in one move without importing transitive packages. Accept its default plugin and sanitization policy, or stop here.
3. **Step 3 (only if users explicitly ask to see Markdown colored while typing): CodeMirror 6 with `@codemirror/lang-markdown`.** Preferred over the backdrop overlay: overlay alignment against a native `textarea` is fragile across wrapping, zoom, forced-colors, and mobile scrolling, and the custom range-mapping code becomes permanent maintenance for a result that a purpose-built editor already provides. CodeMirror's cost is a known, versioned subsystem rather than an open-ended alignment bug surface.

Do not start at step 3. Source highlighting is the most expensive interpretation and the least evidenced demand.

### Proposed UX

- Keep the note `textarea` as the default and only editing surface; typing behavior is unchanged.
- Add a two-state segmented control in the note header: **Edit** | **Preview**, defaulting to Edit. Use a labeled toggle/tablist with an accessible name, so the mode is announced and keyboard reachable.
- Preview renders read-only sanitized HTML in the same content column and typography scale as the editor, so switching does not shift layout.
- Preserve caret position and scroll offset when returning to Edit; preview is never editable and never a second input.
- No split view initially. A side-by-side option can be added later behind the same control on wide viewports only, once single-pane preview is validated.
- Apply the same control and behavior to both `NotePage` and `NewNotePage` for parity.

### Next step

Implement step 1: a preview mode on `/notes` reusing the existing `micromark` render path, with the Edit/Preview control described above and no dependency changes. Before implementation, get a product decision on one question only: **is CommonMark sufficient, or is GFM (tables, task lists, autolinks) required for notes?** A "GFM required" answer collapses steps 1 and 2 into a single `TextPart`-based implementation.

### Durable decisions from the recommendation

- Preview is the entry point for Markdown support in `/notes`; source highlighting is explicitly out of scope until demand is demonstrated.
- The `textarea` remains the authoritative editable surface through steps 1 and 2.
- Prefer CodeMirror over a synchronized backdrop if source highlighting is ever approved.
- No new direct dependencies are introduced for steps 1 or 2.

### Remaining blockers

- CommonMark vs GFM dialect decision for notes (blocks the step 1/step 2 fork).
- No recorded browser and assistive-technology support matrix.
- No fenced-code language coverage policy, required only if step 2 proceeds.

## Task 4: CommonMark Edit/Preview Toggle

Implemented step 1 of the recommended path with no dependency changes.

### Durable decisions

- `src/markdown/markdownHtmlRender.ts` is the single shared CommonMark render path. `finalizedMessageHtmlRender` now delegates to it, so notes and finalized messages cannot diverge on the `allowDangerousHtml: false` / `allowDangerousProtocol: false` sanitization posture.
- `NoteContentField` owns the Edit/Preview control and is used by both `NotePage` and `NewNotePage`, guaranteeing parity by construction rather than by duplicated markup.
- Mode is component-local view state only. It is not persisted, not in the URL, and not in the note schema; every reload starts in Edit.
- The `textarea` remains the only editable and submitted control. The preview panel is a non-editable `tabpanel`; both panels stay mounted and are toggled with `hidden`, so caret, scroll, draft, dirty, and required/submit behavior are untouched.
- Empty content renders a literal "Nothing to preview yet." message instead of an empty preview surface.

### Verification

- `bun test` (169 pass), `bun run typecheck`, `bun run format`.
- `test/note-content-field.test.ts` covers the default Edit mode, the toggle, CommonMark output, sanitization, the empty-content case, and both pages wiring the shared field with no remaining local `<textarea>`.
- agent-browser against the managed dev UI on `localhost:6000`: `/notes/new` and an existing note both expose a `tablist` "Note view mode" with Edit selected by default, Preview renders semantic HTML, returning to Edit preserves the textarea value and the `codeline.note.new.content` draft, and the existing-note Save button still enables on dirty content.
- Chrome blocks port 6000 as unsafe; the browser session required `--args "--explicitly-allowed-ports=6000,6001"`.

## Task 6: Three-Way Switcher, Persistence, Dynamic Title, Back Icon

### Durable decisions

- The `role="tablist"` pair is replaced by a `fieldset` + visually hidden `legend` + `aria-pressed` icon buttons, following `ThemeToggle.tsx`. Buttons are icon-only with `aria-label`/`title`; the SVGs are `aria-hidden` and inline, matching the existing delete-icon convention. No icon system was introduced.
- `codeline.note.viewMode` is the single global key shared by both pages. `noteViewModeRead` is defensive: missing, invalid, or unavailable storage (`try`/`catch` plus optional `globalThis.localStorage`) all fall back to `edit`. Validation uses the valibot `noteViewModeSchema` picklist, so no free-form string reaches the UI.
- `split` is one CSS grid: single column by default, `lg:grid-cols-2` side-by-side. Verified as `460px` at a 500px viewport and `376px 376px` at 1280px.
- The textarea stays the only editable, submitted control. Modes only toggle `hidden`; both panels stay mounted, so caret, scroll, draft, dirty, and required/submit behavior are unchanged. The preview lost its `tabpanel` role and now uses `aria-label="Note preview"`.
- `noteContentTitleDerive` takes the trimmed first line, falls back to `New Note` for whitespace-only content, and hard-truncates at 50 characters with no ellipsis, so the displayed title never exceeds 50 characters. `noteTitleStateCreate` debounces at 200ms. Both headings use `truncate` with a `min-w-0` container.
- Existing `NotePage` and `NewNotePage` headings are now identical derived titles; the static `Edit note` / `New note` strings are gone. `NoteBackLink` is shared so the decorative left-arrow cannot diverge between pages.
- `noteTitleStateCreate` and `noteViewModeStateCreate` use `solid-js/dist/solid.js`, matching existing state factories, because `@adaptive-ds/solid-ui`'s `createSignalObject` cannot resolve `solid-js` under `bun test`.

### Verification

- `bun test` (172 pass), `bun run typecheck`, `bun run format`.
- `test/note-content-field.test.ts` covers per-mode editor/preview/split visibility, preview sanitization, the empty-content case, title derivation (fallback, trim, 50-character cap), storage default/invalid/round-trip, the unavailable-storage path, and both pages wiring the shared switcher, back link, and derived title.
- agent-browser against the managed dev services on `localhost:6000`: `/notes/new` exposes Edit/Preview/Edit and preview buttons; typing updates the heading to the debounced first line; split shows both panes with `376px 376px` at 1280px and one `460px` column at 500px; `codeline.note.viewMode` persists `split` across a navigation into an existing note, and selecting Edit there writes `edit` back; the existing-note Save button still enables only on dirty content; no page errors.
