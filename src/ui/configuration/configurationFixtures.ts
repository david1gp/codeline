import type { ConfigurationEntry } from "./configurationEntrySchema.js"
import type { ConfigurationSection } from "./configurationSectionSchema.js"
export const configurationFixtures = {
  subagents: [
    {
      content:
        "Review the requested change for correctness, accessibility, and regressions. Return findings with file references.",
      description: "Performs a focused, read-only implementation review.",
      enabled: true,
      id: "reviewer",
      name: "Reviewer",
    },
    {
      content:
        "Explore the repository and report relevant files, conventions, dependencies, and tests. Do not edit files.",
      description: "Maps unfamiliar areas of a codebase before implementation.",
      enabled: true,
      id: "explorer",
      name: "Explorer",
    },
  ],
  skills: [
    {
      content: "Use one export per file, subject-first names, Result-based errors, and view-only TSX components.",
      description: "Applies the repository TypeScript and Solid component conventions.",
      enabled: true,
      id: "code-style",
      name: "Code style",
    },
    {
      content: "Run focused checks, typecheck, formatting, and database validation before preparing a release.",
      description: "Provides the repository release verification workflow.",
      enabled: false,
      id: "release-checklist",
      name: "Release checklist",
    },
  ],
  commands: [
    {
      content: "bun test --max-concurrency=1 {{file}}",
      description: "Runs one focused Bun test file with repository-safe concurrency.",
      enabled: true,
      id: "test-focused",
      name: "Test focused",
    },
    {
      content: "bun run typecheck",
      description: "Checks the complete TypeScript project without emitting files.",
      enabled: true,
      id: "typecheck",
      name: "Typecheck",
    },
  ],
} as const satisfies Record<ConfigurationSection, readonly ConfigurationEntry[]>
