export const demoProjectGitFixture = {
  branches: {
    currentBranch: "feature/demo-catalog",
    otherBranches: ["main", "release/2026-08", "fix/preview-abort"],
  },
  diffSummary: {
    additions: 214,
    binaryFiles: 1,
    deletions: 37,
    filesChanged: 6,
    isGitRepository: true,
  },
  status: {
    branch: "feature/demo-catalog",
    files: [
      { path: "src/project/ProjectBrowser.tsx", status: "modified" },
      { path: "src/project/projectBrowserView.ts", status: "added" },
      { path: "src/ui/FilesPage.tsx", status: "modified" },
      { path: "docs/legacy-browser.md", status: "deleted" },
      { path: "src/ui/demo/demoProjectsFixture.ts", status: "untracked" },
    ],
    isDirty: true,
    isGitRepository: true,
  },
} as const
