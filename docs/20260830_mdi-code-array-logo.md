# MDI Code Array Logo

## Goal

Use the Material Design Icons `code-array` glyph as Codeline's black-on-white rounded-square logo, save the source asset as `public/logo.svg`, generate favicon/PWA assets, configure the website to display them, verify the managed preview, commit the changes, and deploy.

## Decisions

- Use the repository-installed `mdiCodeArray` path from `@mdi/js`.
- Keep the logo artwork self-contained in `public/logo.svg`: white rounded square with a black glyph.
- Update the existing favicon, touch icon, PWA icons, manifest references, service-worker asset handling, and visible application branding only where needed.
- Use repository-managed scripts and services for generation, verification, and deployment.

## Approach

- Add the canonical SVG and deterministically generate the required raster/favicon derivatives.
- Wire the assets into document metadata, the web manifest, service-worker caching, and the application header.
- Run focused checks, verify the combined managed preview in a browser, then use the commits skill and deploy workflow.

## Tasks

- [x] 1. Implement the logo asset, generated favicon/PWA assets, and website integration.
- [x] 2. Verify static checks and the repository-managed combined preview, including browser-visible branding.
- [ ] 3. Create and push conventional commits using the commits skill, then deploy with the managed workflow.
