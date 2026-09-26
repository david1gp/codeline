# UI project setup

## Goal

Bring the shared Solid UI into codeline, multichat, project-registry, and assets-service, and make the three newly configured UI projects match the established codeline development and operations setup.

## Decisions

- Treat `solid-ui/ui` as the source for synchronized shared UI files.
- Use codeline and rift-command as references for SPA routing, Tailwind integration, build tooling, and user systemd services.
- Keep Vite and Rsbuild configurations aligned without duplicate Tailwind imports.
- Use Bun across the projects; the new target UIs currently have little or no shared frontend setup.
- Preserve the existing live caddy registrations and generated ports: multichat `3007`, project-registry `3009`, assets-service `3010`; switch the latter two from static to proxy while keeping their paths and domains.
- Keep each application entry outside the synchronized `ui/` tree so future source-to-target rsync with deletion is safe.

## Approach

- Inspect the source UI, reference projects, target projects, caddy registry, and ops conventions.
- Synchronize shared UI and component guidance.
- Register ports and configure both build tools and Solid Router SPA entry points.
- Add minimal hello-world pages and systemd user services.
- Verify builds and service configuration.

## Tasks

- [x] 1. Inspect existing project, UI, caddy, and ops conventions.
- [x] 2. Synchronize shared UI into all four projects and update component lookup guidance.
- [x] 3. Register the three projects and configure their generated ports.
- [x] 4. Configure Vite, Rsbuild, Solid Router SPA mode, and hello-world pages for multichat.
- [x] 5. Configure Vite, Rsbuild, Solid Router SPA mode, and hello-world pages for project-registry.
- [x] 6. Configure Vite, Rsbuild, Solid Router SPA mode, and hello-world pages for assets-service.
- [x] 7. Add user systemd dev services for the three projects using the reference projects.
- [ ] 8. Verify shared UI coverage, Tailwind imports, builds, routing, and services.

## Paths

- `solid-ui/ui`
- `codeline/ui`
- `codeline/AGENTS.md`
- `multichat/ui`
- `multichat/AGENTS.md`
- `project-registry/ui`
- `project-registry/AGENTS.md`
- `assets-service/ui`
- `assets-service/AGENTS.md`
- ops and caddy registry paths identified during inspection
