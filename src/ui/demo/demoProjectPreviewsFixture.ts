/** Inline data URLs keep binary previews renderable without any backend. */
const demoProjectImageDataUrl =
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22240%22%20height%3D%22120%22%3E%3Crect%20width%3D%22240%22%20height%3D%22120%22%20fill%3D%22%23132033%22%2F%3E%3Ctext%20x%3D%2220%22%20y%3D%2268%22%20fill%3D%22%234da3ff%22%20font-family%3D%22monospace%22%20font-size%3D%2224%22%3Elogo.png%3C%2Ftext%3E%3C%2Fsvg%3E"

export const demoProjectPreviewsFixture = {
  "README.md": {
    content:
      "# Codeline\n\nA local-first workspace for agent sessions.\n\n## Getting started\n\n- Install dependencies with `bun install`\n- Start the managed dev services\n- Open `/demo` to browse the component catalog\n\n> The catalog renders **real** production views from deterministic fixtures.",
    kind: "text",
    mimeType: "text/markdown",
    path: "README.md",
    size: 2_418,
  },
  "logo.png": {
    kind: "image",
    mimeType: "image/png",
    path: "logo.png",
    size: 48_902,
    url: demoProjectImageDataUrl,
  },
  "src/index.ts": {
    content: 'import { serverStart } from "./server/serverStart.js"\n\nawait serverStart()\n',
    kind: "text",
    mimeType: "text/typescript",
    path: "src/index.ts",
    size: 812,
  },
  "src/ui/App.tsx": {
    content: 'export function App() {\n  return <main class="app">Codeline</main>\n}\n',
    kind: "text",
    mimeType: "text/typescript",
    path: "src/ui/App.tsx",
    size: 1_902,
  },
  "test/appSmoke.test.ts": {
    content: 'import { expect, test } from "bun:test"\n\ntest("app boots", () => {\n  expect(true).toBe(true)\n})\n',
    kind: "text",
    mimeType: "text/typescript",
    path: "test/appSmoke.test.ts",
    size: 640,
  },
  "package.json": {
    content: '{\n  "name": "codeline",\n  "private": true,\n  "type": "module"\n}\n',
    kind: "text",
    mimeType: "application/json",
    path: "package.json",
    size: 1_136,
  },
} as const
