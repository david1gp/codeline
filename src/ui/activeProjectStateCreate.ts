import { signalObjectCreate } from "./signalObjectCreate.js"

type ActiveProject = {
  id?: string | null
  label: string
  path: string
}

const activeProjectDefault: ActiveProject = {
  id: null,
  label: "Home",
  path: "~",
}

export function activeProjectStateCreate(initialProject: ActiveProject = activeProjectDefault) {
  const project = signalObjectCreate(initialProject)

  return {
    project: project.get,
    projectActivate: (nextProject: ActiveProject) => project.set(nextProject),
  }
}

export type ActiveProjectState = ReturnType<typeof activeProjectStateCreate>
