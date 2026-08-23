import { afterEach, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Hono } from "hono"
import { apiRoutesAdd } from "../src/api/apiRoutesAdd.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { appCreate } from "../src/app/appCreate.js"
import { serverStart } from "../src/server/serverStart.js"

const originalProjectRoots = Bun.env.CODELINE_PROJECT_ROOTS
const originalConfigurationStoreDir = Bun.env.CONFIG_STORE_DIR
const configuration = {
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "test",
} as const
const database = { client: { close: () => undefined }, db: {} } as never

afterEach(() => {
  if (originalProjectRoots === undefined) delete Bun.env.CODELINE_PROJECT_ROOTS
  else Bun.env.CODELINE_PROJECT_ROOTS = originalProjectRoots
  if (originalConfigurationStoreDir === undefined) delete Bun.env.CONFIG_STORE_DIR
  else Bun.env.CONFIG_STORE_DIR = originalConfigurationStoreDir
})

test("server startup parses and forwards configured project roots", async () => {
  const firstRoot = path.resolve("configured-projects")
  const secondRoot = path.resolve("other-projects")
  Bun.env.CODELINE_PROJECT_ROOTS = JSON.stringify(["./configured-projects", secondRoot])
  let receivedProjectRootDirs: readonly string[] | undefined

  await serverStart({
    appCreate: (options) => {
      receivedProjectRootDirs = options.projectRootDirs
      return appCreate()
    },
    configuration,
    configurationStore: {} as never,
    database,
    serve: () => ({
      stop: async () => undefined,
      url: new URL("http://codeline.test"),
    }),
    signalSource: {
      once: () => undefined,
      removeListener: () => undefined,
    },
  })

  expect(receivedProjectRootDirs).toEqual([firstRoot, secondRoot])
})

test("explicit single-root startup configuration overrides configured roots", async () => {
  Bun.env.CODELINE_PROJECT_ROOTS = JSON.stringify(["./configured-projects"])
  let receivedProjectRootDirs: readonly string[] | undefined
  let receivedProjectRootDir: string | undefined

  await serverStart({
    appCreate: (options) => {
      receivedProjectRootDirs = options.projectRootDirs
      receivedProjectRootDir = options.projectRootDir
      return appCreate()
    },
    configuration,
    configurationStore: {} as never,
    database,
    projectRootDirs: [path.resolve("injected-projects")],
    projectRootDir: path.resolve("single-project"),
    serve: () => ({
      stop: async () => undefined,
      url: new URL("http://codeline.test"),
    }),
    signalSource: {
      once: () => undefined,
      removeListener: () => undefined,
    },
  })

  expect(receivedProjectRootDirs).toEqual([path.resolve("single-project")])
  expect(receivedProjectRootDir).toBe(path.resolve("single-project"))
})

test("managed startup opens the configured configuration store", async () => {
  const configurationStoreDir = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-startup-configuration-"))
  Bun.env.CONFIG_STORE_DIR = configurationStoreDir
  let receivedConfigurationStore: { gitStore: { dir: string } } | undefined

  try {
    await serverStart({
      appCreate: (options) => {
        receivedConfigurationStore = options.configurationStore as typeof receivedConfigurationStore
        return appCreate()
      },
      configuration,
      database,
      serve: () => ({
        stop: async () => undefined,
        url: new URL("http://codeline.test"),
      }),
      signalSource: {
        once: () => undefined,
        removeListener: () => undefined,
      },
    })

    expect(receivedConfigurationStore?.gitStore.dir).toBe(configurationStoreDir)
  } finally {
    await fs.rm(configurationStoreDir, { force: true, recursive: true })
  }
})

test("app and API composition preserve project root ordering and adapter precedence", async () => {
  const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-root-first-"))
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-root-second-"))
  const singleRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-root-single-"))
  try {
    await fs.mkdir(path.join(firstRoot, "first-project"))
    await fs.mkdir(path.join(secondRoot, "second-project"))
    await fs.writeFile(path.join(firstRoot, "first-project", "README.md"), "first\n", "utf8")
    await fs.writeFile(path.join(secondRoot, "second-project", "README.md"), "second\n", "utf8")
    await fs.writeFile(path.join(singleRoot, "README.md"), "single\n", "utf8")

    const app = appCreate({ projectRootDirs: [firstRoot, secondRoot] })
    const list = await app.request("http://codeline.test/api/project/list")
    expect(list.status).toBe(200)
    const projects = (await list.json()).projects as Array<{ id: string; label: string }>
    expect(projects.map((project) => project.label)).toEqual(["first-project", "second-project"])

    const response = await app.request("http://codeline.test/api/project/text?path=README.md")

    expect(response.status).toBe(400)

    const firstProject = projects.find((project) => project.label === "first-project")
    expect(firstProject).toBeDefined()
    if (firstProject === undefined) return
    const scopedResponse = await app.request(
      `http://codeline.test/api/project/text?project=${firstProject.id}&path=README.md`,
    )
    expect(scopedResponse.status).toBe(200)
    expect(await scopedResponse.json()).toMatchObject({ content: "first\n" })

    const singleRootApp = appCreate({ projectRootDirs: [firstRoot, secondRoot], projectRootDir: singleRoot })
    const singleRootResponse = await singleRootApp.request("http://codeline.test/api/project/text?path=README.md")

    expect(singleRootResponse.status).toBe(200)
    expect(await singleRootResponse.json()).toMatchObject({ content: "single\n" })

    const api = new Hono<AppEnvironment>()
    apiRoutesAdd(api, async () => ({ success: true, data: undefined }), {
      projectRootDirs: [firstRoot, secondRoot],
    })
    const apiList = await api.request("http://codeline.test/api/project/list")
    expect(apiList.status).toBe(200)
    const apiProjects = (await apiList.json()).projects as Array<{ id: string; label: string }>
    const apiProject = apiProjects.find((project) => project.label === "first-project")
    expect(apiProject).toBeDefined()
    if (apiProject === undefined) return
    const apiResponse = await api.request(
      `http://codeline.test/api/project/text?project=${apiProject.id}&path=README.md`,
    )

    expect(apiResponse.status).toBe(200)
    expect(await apiResponse.json()).toMatchObject({ content: "first\n" })
  } finally {
    await Promise.all([
      fs.rm(firstRoot, { force: true, recursive: true }),
      fs.rm(secondRoot, { force: true, recursive: true }),
      fs.rm(singleRoot, { force: true, recursive: true }),
    ])
  }
})

test("explicitly empty project roots expose no projects or filesystem fallback", async () => {
  const app = appCreate({ projectRootDirs: [] })

  const list = await app.request("http://codeline.test/api/project/list")
  expect(list.status).toBe(200)
  expect(await list.json()).toEqual({ projects: [], truncated: false })

  const response = await app.request("http://codeline.test/api/project/text?path=README.md")
  expect(response.status).toBe(400)
  expect(JSON.stringify(await response.json())).not.toContain(process.cwd())
})

test("unconfigured app composition exposes no broad working-directory fallback", async () => {
  const app = appCreate()

  const list = await app.request("http://codeline.test/api/project/list")
  expect(list.status).toBe(200)
  expect(await list.json()).toEqual({ projects: [], truncated: false })
  expect(list.headers.get("X-Codeline-Project-Mode")).toBeNull()

  const response = await app.request("http://codeline.test/api/project/text?path=README.md")
  expect(response.status).toBe(400)
  expect(JSON.stringify(await response.json())).not.toContain(process.cwd())
})
