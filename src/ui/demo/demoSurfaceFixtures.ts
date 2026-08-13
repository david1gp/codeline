import type { DemoSurfaceFixture } from "./demoSurfaceFixture.js"

export const demoSurfaceFixtures = {
  models: {
    kind: "models",
    models: [
      {
        context: "32k",
        enabled: true,
        label: "Codeline Deterministic",
        provider: "Local fixture",
        reasoning: "High",
      },
      { context: "128k", enabled: true, label: "Codex Large", provider: "Codex-LB", reasoning: "Medium" },
      { context: "64k", enabled: false, label: "Review Fast", provider: "CLIProxyAPI", reasoning: "Low" },
    ],
    subtitle: "Display-only model preferences. Credentials and provider runtimes are not loaded.",
    title: "Models",
  },
  skills: {
    kind: "skills",
    skills: [
      {
        description: "Repository conventions for TypeScript and Solid views.",
        label: "code-style",
        scope: "user",
        status: "available",
      },
      {
        description: "Browser-based responsive UI verification workflow.",
        label: "agent-browser",
        scope: "user",
        status: "available",
      },
      {
        description: "Example project-local release checklist.",
        label: "release-check",
        scope: "project",
        status: "disabled",
      },
    ],
    subtitle: "Deterministic discovery state with user and project scopes.",
    title: "Skills",
  },
  stats: {
    kind: "stats",
    metrics: [
      { label: "Turns", value: "18" },
      { label: "Tool calls", value: "27" },
      { label: "Elapsed", value: "12m 48s" },
      { label: "Files written", value: "4" },
    ],
    subtitle: "Architecture review · deterministic session snapshot",
    title: "Session statistics",
    usage: [
      { label: "Context", percent: 57, value: "18.2k / 32k" },
      { label: "Input tokens", percent: 72, value: "14,620" },
      { label: "Output tokens", percent: 28, value: "5,740" },
    ],
  },
  "system-prompt": {
    kind: "system-prompt",
    lines: [
      "You are Codeline, a focused coding assistant.",
      "Inspect the project before editing and keep changes minimal.",
      "Use repository-managed services for local verification.",
      "Report changed files and commands that were run.",
    ],
    sources: [
      { label: "Built-in baseline", status: "1,284 tokens" },
      { label: "AGENTS.md", status: "loaded" },
      { label: "Session context", status: "3 files" },
    ],
    subtitle: "Composed preview. This fixture does not alter runtime instructions.",
    title: "System prompt",
  },
  extensions: {
    kind: "extensions",
    statuses: [
      { label: "Formatter", state: "ready", value: "ready" },
      { label: "Type diagnostics", state: "warning", value: "2 notices" },
      { label: "Preview channel", state: "idle", value: "idle" },
    ],
    subtitle: "Inert visual fixtures only. No Pi plugin or extension runtime is present.",
    title: "Extension surfaces",
    widgets: [
      {
        label: "Workspace policy",
        lines: ["Managed services required", "Network tools unavailable in demo"],
        placement: "above editor",
      },
      {
        label: "Review context",
        lines: ["main · 4 changed files", "Typecheck last passed at 11:42"],
        placement: "below editor",
      },
    ],
  },
  "written-files": {
    files: [
      { additions: 86, deletions: 4, path: "src/ui/demo/DemoSurfacePanel.tsx", status: "created" },
      { additions: 24, deletions: 1, path: "src/ui/demo/demoScenarioRegistry.ts", status: "modified" },
      { additions: 31, deletions: 0, path: "src/ui/demo/demoSurfaceFixtures.ts", status: "created" },
    ],
    kind: "written-files",
    subtitle: "Turn 18 · deterministic tool-result summary",
    title: "Written files",
    totals: "3 files · +141 −5",
  },
} as const satisfies Record<
  "extensions" | "models" | "skills" | "stats" | "system-prompt" | "written-files",
  DemoSurfaceFixture
>
