# Project favicon avatars

## Goal

Show a registered project's `public/favicon.ico` as its avatar when present, retain the generated initials avatar as the fallback, and detect additions, replacements, and removals without frequent filesystem work.

## Decisions

- Inspect the exact project-relative path `public/favicon.ico` on the server after normal project authorization.
- Keep favicon state derived from the filesystem; do not persist it in SQLite.
- Return a nullable, revisioned favicon URL in project registry representations. Derive the revision from file metadata such as modification time and size so replacements receive a new browser URL.
- Cache favicon metadata in memory per canonical project path for 24 hours, including absent results. A registry refresh reuses the cached result until it expires.
- Refresh the client registry once every 24 hours while the application remains open. Initial registry loading and existing explicit registry refreshes remain unchanged.
- Serve icons through an authenticated, project-ID-based endpoint that reuses existing authorization and safe-path handling. Do not expose filesystem paths.
- Cache successful revisioned image responses in the browser. A missing, removed, or failed image falls back to the existing generated initials avatar.
- Do not add filesystem watchers or a new dependency.
- Registered projects receive favicon support. Unregistered historical session projects retain generated initials.

## Approach

- Add a focused server helper that safely resolves and stats `public/favicon.ico`, validates it as a readable regular file, computes its revision, and applies a 24-hour in-memory metadata cache.
- Extend the shared registry project schema and representation builder with `faviconUrl: string | null`; both registry list and detail responses use the same resolver.
- Add an authenticated favicon response route keyed by registered project ID, with the appropriate icon content type and revision-aware cache headers.
- Extend shared registry state with a cleanup-safe daily refresh interval.
- Thread each registered project's favicon URL into existing `ProjectAvatar` render sites. Enhance `ProjectAvatar` to prefer the image and recover to its current initials rendering on load failure.

## Tasks

- [x] 1. Add and test the cached favicon metadata resolver for present, absent, replaced, removed, invalid, and expired entries.
- [x] 2. Extend registry API schemas and representations with the nullable revisioned favicon URL, with API coverage for list and detail responses.
- [x] 3. Add and test the authenticated favicon file endpoint, including authorization, path safety, missing-file behavior, content type, and cache headers.
- [x] 4. Add the once-per-24-hours client registry refresh with lifecycle cleanup and focused state tests.
- [x] 5. Update `ProjectAvatar` and registered-project call sites to display favicons with initials fallback, including image-error behavior.
- [x] 6. Run focused tests, typecheck and formatting checks; verify favicon display and fallbacks through the repository-managed combined preview service, with filesystem state transitions covered by the resolver tests.
