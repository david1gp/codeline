# Codeline

`@adaptive-ds/codeline` is a planned local-first coding workspace for AI-assisted software development. It is intended to bring a focused editor-like experience to a SolidJS interface while keeping application state durable, synchronized, and inspectable.

The planned stack is:

- **Bun and TypeScript** for the runtime and toolchain.
- **SolidJS** with `@adaptive-ds/solid-ui` for the browser application.
- **Hono** for the application API and explicit streaming boundaries.
- **TanStack AI** for the type-safe AI execution seam and streamed model events.
- **PostgreSQL and Zero** for durable state and synchronization. Zero development services are planned for a later task.
- **Valibot** for validation at application and persistence boundaries.

The first provider targets are local CLIProxyAPI and Codex-LB configurations. Provider OAuth, Pi ecosystem integrations, MCP, full-text web search, and custom scrollbar behavior are outside the planned scope.

## Status

This repository currently contains task 2 repository infrastructure only. The application vertical slice, AI execution, persistence, synchronization services, and feature parity work have not been implemented yet.

## Local Development

Requirements: Bun 1.3 or newer.

```bash
bun install
bun run dev
```

The current development command runs the bootstrap placeholder and watches for source changes. No external provider credentials or remote services are required for the repository checks.

Useful commands:

```bash
bun run format
bun run format:check
bun run test
bun run build
bun run release
```

Copy `.env.example` to `.env` only when configuring local application work. The checked-out `.env` is ignored and contains generated local-only values; it contains no external credentials.

## Roadmap

The next implementation task will establish separate Solid UI and Hono API routes, Valibot boundaries, TanStack AI streaming seams, and small Bun tests. Later work will add local Zero/PostgreSQL development services, parity slices, durable stream replay, and the explicitly scoped extensions.

## License

MIT. See [LICENSE](./LICENSE).
