import { urlDemoItem } from "../demo_url/urlDemo.js"
import type { DemoScenario } from "./demoScenario.js"

export const demoScenarioRegistry = [
  {
    description: "The empty starting point for a local coding session.",
    href: urlDemoItem("screens", "welcome"),
    label: "Welcome",
    slug: "welcome",
  },
  {
    description: "Markdown, code, reasoning, tools, attachments, and message actions.",
    href: urlDemoItem("screens", "conversation"),
    label: "Conversation",
    slug: "conversation",
  },
  {
    description: "Streaming output with abort, retry, and queued prompts.",
    href: urlDemoItem("screens", "streaming"),
    label: "Streaming",
    slug: "streaming",
  },
  {
    description: "Extended history with minimap and earlier-message navigation.",
    href: urlDemoItem("screens", "long-chat"),
    label: "Long chat",
    slug: "long-chat",
  },
  {
    description: "Representative conversation, session, and file content.",
    href: urlDemoItem("screens", "workspace"),
    label: "Workspace",
    slug: "workspace",
  },
  {
    description: "Expandable project tree, Git states, uploads, tabs, and source selection.",
    href: urlDemoItem("screens", "files"),
    label: "Files",
    slug: "files",
  },
  {
    description: "Rendered Markdown with deterministic frontmatter metadata.",
    href: urlDemoItem("screens", "markdown"),
    label: "Markdown",
    slug: "markdown",
  },
  {
    description: "Mermaid-style source and deterministic diagram preview.",
    href: urlDemoItem("screens", "mermaid"),
    label: "Mermaid",
    slug: "mermaid",
  },
  {
    description: "Side-by-side working tree comparison and conflict state.",
    href: urlDemoItem("screens", "diff"),
    label: "Diff",
    slug: "diff",
  },
  {
    description: "Configured model availability, context, and reasoning preferences.",
    href: urlDemoItem("screens", "models"),
    label: "Models",
    slug: "models",
  },
  {
    description: "User and project skill discovery states.",
    href: urlDemoItem("screens", "skills"),
    label: "Skills",
    slug: "skills",
  },
  {
    description: "Deterministic session metrics and context usage.",
    href: urlDemoItem("screens", "stats"),
    label: "Stats",
    slug: "stats",
  },
  {
    description: "Composed system prompt and source summary.",
    href: urlDemoItem("screens", "system-prompt"),
    label: "Prompt",
    slug: "system-prompt",
  },
  {
    description: "Inert extension widgets and status fixtures.",
    href: urlDemoItem("screens", "extensions"),
    label: "Extensions",
    slug: "extensions",
  },
  {
    description: "Files written during a deterministic turn.",
    href: urlDemoItem("screens", "written-files"),
    label: "Written files",
    slug: "written-files",
  },
] as const satisfies readonly DemoScenario[]
