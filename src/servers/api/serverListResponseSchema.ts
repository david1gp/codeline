import type * as v from "valibot"
import { serverListResponseV2Schema } from "./serverListResponseV2Schema.js"

export const serverListResponseSchema = serverListResponseV2Schema

export type ServerListResponse = v.InferOutput<typeof serverListResponseSchema>
