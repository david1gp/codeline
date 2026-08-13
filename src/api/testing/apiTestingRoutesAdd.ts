import { toServerSentEventsStream } from "@tanstack/ai"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../appEnvironment.js"
import type { ApiErrorResponse } from "../errors/apiErrorResponseSchema.js"
import { testingEchoRequestSchema } from "./testingEchoRequestSchema.js"
import type { TestingEchoResponse } from "./testingEchoResponseSchema.js"
import { testingStreamCreate } from "./testingStreamCreate.js"
import { testingStreamRequestSchema } from "./testingStreamRequestSchema.js"

export function apiTestingRoutesAdd(api: Hono<AppEnvironment>): void {
  api.post("/testing/echo", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = v.safeParse(testingEchoRequestSchema, body)

    if (!parsed.success) {
      const response = {
        error: {
          code: "bad_request",
          message: "The request body must contain a non-empty message.",
        },
      } satisfies ApiErrorResponse

      return context.json(response, 400)
    }

    const response = {
      message: parsed.output.message,
    } satisfies TestingEchoResponse

    return context.json(response)
  })

  api.get("/testing/errors/bad-request", (context) => {
    const response = {
      error: {
        code: "bad_request",
        message: "This deterministic test route returns a bad request.",
      },
    } satisfies ApiErrorResponse

    return context.json(response, 400)
  })

  api.get("/testing/errors/internal-server-error", (context) => {
    const response = {
      error: {
        code: "internal_server_error",
        message: "This deterministic test route returns an internal server error.",
      },
    } satisfies ApiErrorResponse

    return context.json(response, 500)
  })

  api.get("/testing/stream", (context) => {
    const parsed = v.safeParse(testingStreamRequestSchema, context.req.query())

    if (!parsed.success) {
      const response = {
        error: {
          code: "bad_request",
          message: "The stream query must contain a supported scenario and valid millisecond values.",
        },
      } satisfies ApiErrorResponse

      return context.json(response, 400)
    }

    const abortController = new AbortController()
    const requestSignal = context.req.raw.signal
    const onRequestAbort = () => abortController.abort(requestSignal.reason)
    requestSignal.addEventListener("abort", onRequestAbort, { once: true })
    const stream = testingStreamCreate({
      delayMs: parsed.output.delayMs ?? 5,
      idleTimeoutMs: parsed.output.idleTimeoutMs ?? (parsed.output.scenario === "idle-timeout" ? 10 : 1000),
      scenario: parsed.output.scenario,
      signal: abortController.signal,
      cleanup: () => requestSignal.removeEventListener("abort", onRequestAbort),
    })
    const sse = toServerSentEventsStream(stream, abortController, (_chunk, index) => String(index + 1))

    return new Response(sse, {
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    })
  })
}
