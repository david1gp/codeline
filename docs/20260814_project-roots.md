# Project roots

## Goal

- Allow Codeline to discover selectable projects from multiple configured filesystem roots.
- Default project discovery to the operating-system home directory when no roots are configured.
- Preserve bounded, read-only filesystem and Git access without exposing host paths.

## Decisions

- Configure roots as a JSON string array through `CODELINE_PROJECT_ROOTS` and injectable runtime options.
- Treat an omitted configuration as `[os.homedir()]`; treat an explicit empty array as no discovery roots.
- Discover immediate child directories as projects, canonicalize and deduplicate them, and expose opaque project identifiers plus display labels.
- Resolve every project filesystem/Git request server-side from a discovered identifier; never accept an arbitrary client root path.
- Retain the existing single-root injection as a compatibility adapter for focused tests and callers.

## Approach

- Parse and normalize root configuration at startup with a platform-independent home-directory default.
- Add bounded project discovery and selection resolution using the existing path-safety conventions.
- Add a project-list API and scope existing project filesystem/Git APIs by project identifier.
- Add a project selector to the files UI and reset browser state when the selected project changes.
- Cover configuration, discovery, route isolation, UI behavior, and documentation.

## Tasks

- [x] 1. Add project-root configuration parsing, normalization, defaults, and focused tests.
- [x] 2. Plumb configured roots through server, app, and API startup while retaining the single-root adapter.
- [x] 3. Add safe multi-root project discovery and opaque project resolution.
- [x] 4. Add the project-list endpoint and scope existing filesystem/Git routes by project identifier.
- [x] 5. Add project selection and scoped requests to the files UI.
- [x] 6. Update configuration documentation and run focused/full validation.
- [x] 7. Bound discovery work, align labels, and prevent project-identity changes during resolution.
- [x] 8. Scope note project loading, restore the legacy files UI, and prevent stale project-list responses.
- [x] 9. Run final security review and identify release-readiness gaps.
- [x] 10. Resolve opaque project IDs to labels in note grouping while preserving legacy assignments.
- [x] 11. Surface bounded discovery truncation and avoid repeated full discovery per project request.
- [x] 12. Run final full validation and release-readiness review.

## Paths

- `src/configuration/`
- `src/server/serverStart.ts`
- `src/app/appCreate.ts`
- `src/api/apiRoutesAdd.ts`
- `src/project/`
- `src/ui/FilesPage.tsx`
- `test/`
- `README.md`
- `.env.example`
