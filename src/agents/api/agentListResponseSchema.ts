import type * as v from "valibot"
import { agentListResponseV2Schema } from "./agentListResponseV2Schema.js"

export const agentListResponseSchema = agentListResponseV2Schema

export type AgentListResponse = v.InferOutput<typeof agentListResponseSchema>
