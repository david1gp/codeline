import type { RunStatus } from "../schema/runStatusSchema.js"

type RunTerminalKind = "cancelled" | "completed" | "failed" | "interrupted"

export function runHistoryEntryPayloadCreate(input: { id: string; status: RunStatus; terminalKind?: RunTerminalKind }) {
  const summary =
    input.status === "accepted"
      ? "Run accepted"
      : input.status === "running"
        ? "Run running"
        : input.status === "succeeded"
          ? "Run completed"
          : input.status === "failed"
            ? "Run failed"
            : "Run aborted"

  return {
    detailId: input.id,
    id: input.id,
    kind: "run" as const,
    status: input.status,
    summary,
    ...(input.terminalKind === undefined ? {} : { terminalKind: input.terminalKind }),
  }
}
