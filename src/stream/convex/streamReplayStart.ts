import type { GenericMutationCtx } from "convex/server"
import type { Result } from "@adaptive-ds/result"
import { streamCheckpointLoadOrCreate } from "./streamCheckpointLoadOrCreate.js"
import type { StreamCheckpointRecord } from "./streamCheckpointRecord.js"

type StreamMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function streamReplayStart(
  context: StreamMutationContext,
  userId: string,
  sessionId: string,
  streamId: string,
  now = Date.now(),
): Promise<Result<{ created: boolean; checkpoint: StreamCheckpointRecord }>> {
  return streamCheckpointLoadOrCreate(context, userId, sessionId, streamId, now)
}
