# Project avatars

## Goal

Show a small first-letter color avatar before project names so projects are easier to recognize in lists.

## Decisions

- Hash the display name to a fixed palette (same approach as `~/leo_internal/projects`), not a persisted color field.
- First Unicode grapheme of the name, uppercase. Empty name → gray, no letter.
- Hash: djb2-style `5381`, `hash = ((hash * 33) ^ charCode) >>> 0`, then `hash % palette.length`.
- Palette (hex, white letter): orange `#ea580c`, yellow `#ca8a04`, cyan `#0891b2`, green `#16a34a`, red `#dc2626`, pink `#db2777`, blue `#2563eb`, purple `#9333ea`. Empty → gray `#71717a`.
- No API/schema/icon-url work. Native `<select>` options stay text-only.
- Domain UI lives under `src/project/`, not global `src/ui/`.
- One export per file. View-only `.tsx` with a sibling state factory.

## Approach

Pure helpers compute letter + color. `ProjectAvatar` renders a 16px rounded square (`size-4`) with optional `class`. Callers pass the same string they already show as the project label.

Insert before visible project-name labels only:

- Session list project-group headers (replace the folder icon)
- Session list conversation rows (before `projectLabel`)
- Notes workspace group labels

## Tasks

1. Add `src/project/projectAvatarFirstGrapheme.ts` and `src/project/projectAvatarColorResolve.ts` plus colocated `bun:test` files.
2. Add `src/project/ui/projectAvatarStateCreate.ts` and `src/project/ui/ProjectAvatar.tsx`.
3. Use `ProjectAvatar` in `src/ui/SessionList.tsx` group headers and conversation project labels.
4. Use `ProjectAvatar` in `src/note/ui/NoteWorkspacePage.tsx` group labels.

## Paths

- `src/project/projectAvatarFirstGrapheme.ts`
- `src/project/projectAvatarFirstGrapheme.test.ts`
- `src/project/projectAvatarColorResolve.ts`
- `src/project/projectAvatarColorResolve.test.ts`
- `src/project/ui/projectAvatarStateCreate.ts`
- `src/project/ui/ProjectAvatar.tsx`
- `src/ui/SessionList.tsx`
- `src/note/ui/NoteWorkspacePage.tsx`

## Status

Done. Helpers, component, and all three insertion points are implemented. Typecheck, biome on changed files, and the full test suite pass.
