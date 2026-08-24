import type * as v from "valibot"
import { agentDetailResponseV2Schema } from "./agentDetailResponseV2Schema.js"

export const agentDetailResponseSchema = agentDetailResponseV2Schema

export type AgentDetailResponse = v.InferOutput<typeof agentDetailResponseSchema>
