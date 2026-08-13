import type { DemoScenario } from "./demoScenario.js"

export const demoScenarioRegistry = [
  {
    description: "The empty starting point for a local coding session.",
    href: "/demo",
    label: "Welcome",
    slug: "welcome",
  },
  {
    description: "Markdown, code, reasoning, tools, attachments, and message actions.",
    href: "/demo/conversation",
    label: "Conversation",
    slug: "conversation",
  },
  {
    description: "Streaming output with abort, retry, and queued prompts.",
    href: "/demo/streaming",
    label: "Streaming",
    slug: "streaming",
  },
  {
    description: "Extended history with minimap and earlier-message navigation.",
    href: "/demo/long-chat",
    label: "Long chat",
    slug: "long-chat",
  },
  {
    description: "Representative conversation, session, and file content.",
    href: "/demo/workspace",
    label: "Workspace",
    slug: "workspace",
  },
  {
    description: "Expandable project tree, Git states, uploads, tabs, and source selection.",
    href: "/demo/files",
    label: "Files",
    slug: "files",
  },
  {
    description: "Rendered Markdown with deterministic frontmatter metadata.",
    href: "/demo/markdown",
    label: "Markdown",
    slug: "markdown",
  },
  {
    description: "Mermaid-style source and deterministic diagram preview.",
    href: "/demo/mermaid",
    label: "Mermaid",
    slug: "mermaid",
  },
  {
    description: "Side-by-side working tree comparison and conflict state.",
    href: "/demo/diff",
    label: "Diff",
    slug: "diff",
  },
  {
    description: "Configured model availability, context, and reasoning preferences.",
    href: "/demo/models",
    label: "Models",
    slug: "models",
  },
  {
    description: "User and project skill discovery states.",
    href: "/demo/skills",
    label: "Skills",
    slug: "skills",
  },
  {
    description: "Deterministic session metrics and context usage.",
    href: "/demo/stats",
    label: "Stats",
    slug: "stats",
  },
  {
    description: "Composed system prompt and source summary.",
    href: "/demo/system-prompt",
    label: "Prompt",
    slug: "system-prompt",
  },
  {
    description: "Inert extension widgets and status fixtures.",
    href: "/demo/extensions",
    label: "Extensions",
    slug: "extensions",
  },
  {
    description: "Files written during a deterministic turn.",
    href: "/demo/written-files",
    label: "Written files",
    slug: "written-files",
  },
] as const satisfies readonly DemoScenario[]
