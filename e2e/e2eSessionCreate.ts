import { expect, type BrowserContext } from "@playwright/test"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

type ProjectRegisterResponse = { project: { id: string } }

/** Creates a session for the repository project registered by the managed API. */
export async function e2eSessionCreate(context: BrowserContext, baseOrigin: string, body: Record<string, unknown>) {
  const projectResponse = await context.request.post(`${baseOrigin}/api/project/registry/register`, {
    data: { path: e2eRepositoryRoot },
    headers: { origin: baseOrigin },
  })
  expect(projectResponse.ok(), await projectResponse.text()).toBe(true)
  const project = (await projectResponse.json()) as ProjectRegisterResponse
  const { projectId: _projectId, projectPath: _projectPath, ...sessionBody } = body
  return context.request.post(`${baseOrigin}/api/sessions`, {
    data: { ...sessionBody, projectId: project.project.id },
    headers: { origin: baseOrigin },
  })
}
