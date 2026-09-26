import { expect, type BrowserContext } from "@playwright/test"
import { e2eFixtureContextResolve } from "./e2eFixtureContextResolve.js"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

type ProjectRegisterResponse = { project: { id: string } }
type ProjectListResponse = { projects: Array<{ id: string; available: boolean }> }

/** Use a server-owned project, or register the explicitly issued command project path. */
export async function e2eSessionCreate(
  context: BrowserContext,
  baseOrigin: string,
  body: Record<string, unknown>,
  projectPath?: string,
) {
  const fixture = await e2eFixtureContextResolve()
  if (fixture !== undefined && fixture.origin !== baseOrigin) throw new Error("E2E session origin mismatch")
  let projectId: string
  if (fixture !== undefined && projectPath === undefined) {
    const listResponse = await context.request.get(`${baseOrigin}/api/project/registry/list`)
    expect(listResponse.ok(), await listResponse.text()).toBe(true)
    const list = (await listResponse.json()) as ProjectListResponse
    const project = list.projects.find((item) => item.available)
    if (project === undefined) throw new Error("No available server-owned project for E2E session")
    projectId = project.id
  } else {
    const projectResponse = await context.request.post(`${baseOrigin}/api/project/registry/register`, {
      data: { path: projectPath ?? e2eRepositoryRoot },
      headers: { origin: baseOrigin },
    })
    expect(projectResponse.ok(), await projectResponse.text()).toBe(true)
    projectId = ((await projectResponse.json()) as ProjectRegisterResponse).project.id
  }
  const { projectId: _projectId, projectPath: _projectPath, ...sessionBody } = body
  return context.request.post(`${baseOrigin}/api/sessions`, {
    data: { ...sessionBody, projectId },
    headers: { origin: baseOrigin },
  })
}
