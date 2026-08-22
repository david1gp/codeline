import { expect, test } from "bun:test"

const envExample = await Bun.file(new URL("../.env.example", import.meta.url)).text()
const convexDockerEnvironment = await Bun.file(new URL("../ops/dev/convex/env.docker.example", import.meta.url)).text()
const caddyConfiguration = await Bun.file(new URL("../ops/dev/caddy/Caddyfile", import.meta.url)).text()
const convexBackendDefinition = await Bun.file(
  new URL("../ops/dev/convex/codeline-convex-backend.container", import.meta.url),
).text()
const convexDashboardDefinition = await Bun.file(
  new URL("../ops/dev/convex/codeline-convex-dashboard.container", import.meta.url),
).text()
const convexDataVolumeDefinition = await Bun.file(
  new URL("../ops/dev/convex/codeline-convex-data.volume", import.meta.url),
).text()
const convexDeploymentService = await Bun.file(
  new URL("../ops/dev/systemd/codeline-convex-dev.service", import.meta.url),
).text()
const apiService = await Bun.file(new URL("../ops/dev/systemd/codeline-dev-api.service", import.meta.url)).text()
const uiService = await Bun.file(new URL("../ops/dev/systemd/codeline-dev-ui.service", import.meta.url)).text()
const developmentTarget = await Bun.file(new URL("../ops/dev/systemd/codeline-dev.target", import.meta.url)).text()
const installer = await Bun.file(new URL("../ops/dev/systemd/install.sh", import.meta.url)).text()
const developmentScript = await Bun.file(new URL("../ops/dev/codeline-dev.sh", import.meta.url)).text()

const managedDefinitions = [
  convexBackendDefinition,
  convexDashboardDefinition,
  convexDataVolumeDefinition,
  convexDeploymentService,
  apiService,
  uiService,
  developmentTarget,
  caddyConfiguration,
  developmentScript,
].join("\n")

function environmentValue(name: string): string | undefined {
  const line = envExample.split("\n").find((entry) => entry.startsWith(`${name}=`))
  return line?.slice(name.length + 1)
}

function dockerEnvironmentValue(name: string): string | undefined {
  const line = convexDockerEnvironment.split("\n").find((entry) => entry.startsWith(`${name}=`))
  return line?.slice(name.length + 1)
}

test("managed development definitions are Convex-only", () => {
  expect(developmentTarget).toContain("Description=Codeline Convex-only development stack")
  for (const unit of [
    "codeline-convex-backend.service",
    "codeline-convex-dashboard.service",
    "codeline-convex-dev.service",
    "codeline-dev-api.service",
    "codeline-dev-ui.service",
  ]) {
    expect(developmentTarget).toContain(unit)
  }
  expect(convexBackendDefinition).toContain("Image=ghcr.io/get-convex/convex-backend:latest")
  expect(convexBackendDefinition).toContain("Volume=codeline-convex-data.volume:/convex/data")
  expect(convexBackendDefinition).toContain("HealthCmd=curl -f http://127.0.0.1:3210/version")
  expect(convexDashboardDefinition).toContain("Image=ghcr.io/get-convex/convex-dashboard:latest")
  expect(convexDashboardDefinition).toContain("Requires=codeline-convex-backend.service")
  expect(convexDashboardDefinition).toContain("HealthCmd=curl -f http://127.0.0.1:6791/")
  expect(convexDataVolumeDefinition).toContain("VolumeName=codeline-convex-data")
  expect(convexDeploymentService).toContain("Requires=codeline-convex-backend.service")
  expect(convexDeploymentService).toContain("ExecStart=/usr/bin/env bun run convex dev --env-file=.env")
  expect(apiService).toContain("Requires=codeline-convex-dev.service")
  expect(uiService).toContain("Requires=codeline-dev-api.service")
  expect(managedDefinitions).not.toMatch(/postgres|zero/i)
})

test("the installer only links definitions and reloads systemd", () => {
  const installerCommands = installer
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")

  expect(installer).toContain("Preparation only: do not enable or start any unit here.")
  expect(installerCommands).toContain("systemctl --user daemon-reload")
  expect(installerCommands).not.toMatch(/systemctl --user\s+(?:enable|start|restart)/)
  expect(installerCommands).not.toContain("--now")
  expect(installer).toContain("codeline-convex-backend.container")
  expect(installer).toContain("codeline-convex-dashboard.container")
  expect(installer).toContain("codeline-convex-data.volume")
})

test("preview environment and routing use the Convex deployment contract", () => {
  const publicOrigin = environmentValue("PUBLIC_ORIGIN")
  expect(publicOrigin).toBe("https://preview.codeline.work")
  expect(environmentValue("VITE_CONVEX_URL")).toBe("https://convex.preview.codeline.work")
  expect(environmentValue("CONVEX_SELF_HOSTED_URL")).toBe(environmentValue("VITE_CONVEX_URL"))
  expect(dockerEnvironmentValue("CONVEX_CLOUD_ORIGIN")).toBe(environmentValue("VITE_CONVEX_URL"))
  expect(dockerEnvironmentValue("NEXT_PUBLIC_DEPLOYMENT_URL")).toBe(environmentValue("VITE_CONVEX_URL"))
  expect(dockerEnvironmentValue("CONVEX_SITE_ORIGIN")).toBe("https://api.preview.codeline.work")
  expect(caddyConfiguration).toContain("reverse_proxy localhost:6000")
  expect(caddyConfiguration).toContain("convex.preview.codeline.work")
  expect(caddyConfiguration).toContain("reverse_proxy localhost:3210")
  expect(caddyConfiguration).toContain("api.preview.codeline.work")
  expect(caddyConfiguration).toContain("reverse_proxy localhost:3211")
  expect(caddyConfiguration).toContain("dash.preview.codeline.work")
  expect(caddyConfiguration).toContain("reverse_proxy localhost:6791")
  expect(developmentScript).toContain('expected_convex_url="$scheme://convex.$host"')
  expect(developmentScript).toContain('expected_site_url="$scheme://api.$host"')
})

test("legacy PostgreSQL and Zero managed topology is absent", async () => {
  const legacyManagedPaths = [
    "../ops/dev/compose.yaml",
    "../ops/dev/zero/Dockerfile",
    "../ops/dev/systemd/codeline-dev-postgres.service.in",
    "../ops/dev/systemd/codeline-dev-zero-cache.service.in",
    "../ops/dev/systemd/codeline-dev-systemd.sh",
  ]

  for (const path of legacyManagedPaths) {
    expect(await Bun.file(new URL(path, import.meta.url)).exists()).toBe(false)
  }
  expect(managedDefinitions).not.toMatch(/postgres|zero|POSTGRES_|ZERO_/i)
})
