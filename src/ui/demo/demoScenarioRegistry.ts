import type { DemoScenario } from "./demoScenario.js"

export const demoScenarioRegistry = [
  {
    description: "The empty starting point for a local coding session.",
    href: "/demo/screens/welcome",
    label: "Welcome",
    slug: "welcome",
  },
  {
    description: "Markdown, code, reasoning, tools, attachments, and message actions.",
    href: "/demo/screens/conversation",
    label: "Conversation",
    slug: "conversation",
  },
  {
    description: "Streaming output with abort, retry, and queued prompts.",
    href: "/demo/screens/streaming",
    label: "Streaming",
    slug: "streaming",
  },
  {
    description: "Extended history with minimap and earlier-message navigation.",
    href: "/demo/screens/long-chat",
    label: "Long chat",
    slug: "long-chat",
  },
  {
    description: "Representative conversation, session, and file content.",
    href: "/demo/screens/workspace",
    label: "Workspace",
    slug: "workspace",
  },
  {
    description: "Expandable project tree, Git states, uploads, tabs, and source selection.",
    href: "/demo/screens/files",
    label: "Files",
    slug: "files",
  },
  {
    description: "Rendered Markdown with deterministic frontmatter metadata.",
    href: "/demo/screens/markdown",
    label: "Markdown",
    slug: "markdown",
  },
  {
    description: "Mermaid-style source and deterministic diagram preview.",
    href: "/demo/screens/mermaid",
    label: "Mermaid",
    slug: "mermaid",
  },
  {
    description: "Side-by-side working tree comparison and conflict state.",
    href: "/demo/screens/diff",
    label: "Diff",
    slug: "diff",
  },
  {
    description: "Configured model availability, context, and reasoning preferences.",
    href: "/demo/screens/models",
    label: "Models",
    slug: "models",
  },
  {
    description: "User and project skill discovery states.",
    href: "/demo/screens/skills",
    label: "Skills",
    slug: "skills",
  },
  {
    description: "Deterministic session metrics and context usage.",
    href: "/demo/screens/stats",
    label: "Stats",
    slug: "stats",
  },
  {
    description: "Composed system prompt and source summary.",
    href: "/demo/screens/system-prompt",
    label: "Prompt",
    slug: "system-prompt",
  },
  {
    description: "Inert extension widgets and status fixtures.",
    href: "/demo/screens/extensions",
    label: "Extensions",
    slug: "extensions",
  },
  {
    description: "Files written during a deterministic turn.",
    href: "/demo/screens/written-files",
    label: "Written files",
    slug: "written-files",
  },
] as const satisfies readonly DemoScenario[]
