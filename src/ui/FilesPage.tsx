import { ProjectBrowser } from "../project/ProjectBrowser.js"

export function FilesPage() {
  return (
    <main class="min-h-0 overflow-auto p-6 max-[760px]:p-4" aria-label="Project files workspace">
      <ProjectBrowser />
    </main>
  )
}
