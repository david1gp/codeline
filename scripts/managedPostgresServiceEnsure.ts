import { createResult, createResultError, type Result } from "@adaptive-ds/result"

const managedPostgresService = "codeline-dev-postgres.service"

function commandOutputRead(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim()
}

export function managedPostgresServiceEnsure(): Result<true> {
  const op = "managedPostgresServiceEnsure"
  const systemctl = Bun.which("systemctl")
  if (systemctl === null) {
    return createResultError(op, "systemctl is required to start the managed PostgreSQL service.")
  }

  const start = Bun.spawnSync({
    cmd: [systemctl, "--user", "start", managedPostgresService],
    stderr: "pipe",
    stdout: "pipe",
  })
  if (start.exitCode !== 0) {
    const message = commandOutputRead(start.stderr)
    return createResultError(op, message || "Unable to start the managed PostgreSQL service.")
  }

  const activeState = Bun.spawnSync({
    cmd: [systemctl, "--user", "show", managedPostgresService, "--property=ActiveState", "--value"],
    stderr: "pipe",
    stdout: "pipe",
  })
  if (activeState.exitCode !== 0 || commandOutputRead(activeState.stdout) !== "active") {
    return createResultError(op, "The managed PostgreSQL service is not active; refusing to use the database.")
  }

  return createResult(true)
}
