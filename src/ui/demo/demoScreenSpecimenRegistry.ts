import { urlDemoItem } from "../demo_url/urlDemo.js"
import type { DemoSpecimen } from "./demoSpecimen.js"

export const demoScreenSpecimenRegistry = [
  {
    description: "The real workspace screen composed from fixture state instead of live HTTP calls.",
    href: urlDemoItem("screens", "workspace-screen"),
    label: "Workspace screen",
    slug: "workspace-screen",
    variants: ["ready", "streaming", "loading", "empty", "error"],
  },
  {
    description: "The real project files screen with discovery, browsing, and preview from fixtures only.",
    href: urlDemoItem("screens", "files-screen"),
    label: "Files screen",
    slug: "files-screen",
    variants: ["ready", "streaming", "loading", "empty", "error"],
  },
  {
    description: "The real notes index grouped by project, with loading, empty, and error outcomes.",
    href: urlDemoItem("screens", "notes-screen"),
    label: "Notes screen",
    slug: "notes-screen",
    variants: ["ready", "loading", "empty", "error"],
  },
  {
    description: "The real new-note screen with a draft, edit-only mode, saving, and save failure.",
    href: urlDemoItem("screens", "new-note-screen"),
    label: "New note screen",
    slug: "new-note-screen",
    variants: ["ready", "editing", "loading", "empty", "error"],
  },
  {
    description: "The real note workspace with sidebar navigation, editor, preview, and delete confirmation.",
    href: urlDemoItem("screens", "note-workspace-screen"),
    label: "Note workspace screen",
    slug: "note-workspace-screen",
    variants: ["ready", "editing", "streaming", "loading", "empty", "error"],
  },
  {
    description: "The real note detail screen with editor, project assignment, and delete confirmation.",
    href: urlDemoItem("screens", "note-screen"),
    label: "Note screen",
    slug: "note-screen",
    variants: ["ready", "editing", "streaming", "loading", "empty", "error"],
  },
  {
    description: "The real application header with navigation, theme, PWA, event-feed, and API status.",
    href: urlDemoItem("screens", "app-shell"),
    label: "Application shell",
    slug: "app-shell",
    variants: ["ready", "editing", "streaming", "loading", "empty", "error"],
  },
] as const satisfies readonly DemoSpecimen[]
