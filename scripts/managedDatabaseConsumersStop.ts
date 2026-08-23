import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { managedDatabaseConsumerUnitsRead } from "./managedDatabaseConsumerUnits.js"

const stoppedStates = new Set(["inactive", "failed"])

function commandOutputRead(output: Uint8Array): string {
  return new TextDecoder().decode(output).trim()
}

function unitStateRead(systemctl: string, unit: string): Result<string> {
  const op = "managedDatabaseConsumersStop"
  const loadState = Bun.spawnSync({
    cmd: [systemctl, "--user", "show", unit, "--property=LoadState", "--value"],
    stderr: "pipe",
    stdout: "pipe",
  })
  if (loadState.exitCode !== 0 || commandOutputRead(loadState.stdout) !== "loaded") {
    return createResultError(op, `Unable to verify the managed database consumer ${unit}.`)
  }

  const activeState = Bun.spawnSync({
    cmd: [systemctl, "--user", "show", unit, "--property=ActiveState", "--value"],
    stderr: "pipe",
    stdout: "pipe",
  })
  if (activeState.exitCode !== 0) {
    return createResultError(op, `Unable to verify the managed database consumer ${unit}.`)
  }
  return createResult(commandOutputRead(activeState.stdout))
}

export function managedDatabaseConsumersStop(): Result<true> {
  const op = "managedDatabaseConsumersStop"
  const systemctl = Bun.which("systemctl")
  if (systemctl === null) {
    return createResultError(op, "systemctl is required to stop managed database consumers before a reset.")
  }

  const units = ["codeline-dev.target", ...managedDatabaseConsumerUnitsRead()]
  const stopTarget = Bun.spawnSync({
    cmd: [systemctl, "--user", "stop", ...units],
    stderr: "pipe",
    stdout: "pipe",
  })
  if (stopTarget.exitCode !== 0) {
    const message = commandOutputRead(stopTarget.stderr)
    return createResultError(op, message || "Unable to stop the managed Codeline development target.")
  }

  for (const unit of units) {
    const state = unitStateRead(systemctl, unit)
    if (!state.success) return state
    if (!stoppedStates.has(state.data)) {
      return createResultError(op, `Managed database consumer ${unit} is still ${state.data}; refusing to reset.`)
    }
  }

  return createResult(true)
}
