import type { ProjectRegistryApiProject } from "../../project/api/projectRegistryApiProjectSchema.js"
import { demoNoteProjectId } from "./demoNoteProjectId.js"

export const demoNoteProjectsFixture: readonly ProjectRegistryApiProject[] = [
  { available: true, id: demoNoteProjectId, label: "codeline", parentFolder: null },
]
