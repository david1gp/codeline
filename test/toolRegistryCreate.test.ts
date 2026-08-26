import { expect, test } from "bun:test"
import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { toolErrorCodes } from "../src/tools/runtime/toolErrorCodes.js"
import { toolRegistryCreate } from "../src/tools/runtime/toolRegistryCreate.js"

const inputSchema = v.strictObject({ value: v.pipe(v.string(), v.minLength(1)) })
const outputSchema = v.strictObject({ result: v.string() })

function context(
  signal = new AbortController().signal,
  options: { outputLimit?: number; timeoutMs?: number | null } = {},
) {
  return { ...options, signal, toolCallId: "tool-call-1" }
}

function registryRegister(
  registry: ReturnType<typeof toolRegistryCreate>,
  options: {
    enabled?: boolean
    execute?: (input: { value: string }, signal: AbortSignal) => Result<unknown> | Promise<Result<unknown>>
    outputSchema?: v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>
  } = {},
) {
  return registry.register({
    enabled: options.enabled,
    execute: async (executionContext, input) => {
      if (options.execute !== undefined) return options.execute(input, executionContext.signal)
      return createResult({ result: input.value })
    },
    inputSchema,
    name: "bash",
    outputSchema: options.outputSchema ?? outputSchema,
  })
}

test("starts empty and lists only enabled registered tool names", () => {
  const registry = toolRegistryCreate()
  expect(registry.list()).toEqual([])
  expect(registryRegister(registry).success).toBe(true)
  expect(registry.list()).toEqual(["bash"])
})

test("rejects unknown, disabled, invalid input, and duplicate registrations deterministically", async () => {
  const registry = toolRegistryCreate()
  expect(registryRegister(registry).success).toBe(true)
  expect(registryRegister(registry).success).toBe(false)

  const unknown = await registry.execute("webfetch", {}, context())
  expect(unknown).toMatchObject({ code: toolErrorCodes.unknown, errorMessage: "The webfetch tool is not registered." })

  const invalidName = await registry.execute("grep", {}, context())
  expect(invalidName).toMatchObject({ code: toolErrorCodes.invalidName, errorMessage: "The tool name is invalid." })

  const invalidInput = await registry.execute("bash", { value: 42 }, context())
  expect(invalidInput).toMatchObject({ code: toolErrorCodes.invalidInput, errorMessage: "The bash input is invalid." })

  const extraInput = await registry.execute("bash", { extra: true, value: "run" }, context())
  expect(extraInput).toMatchObject({ code: toolErrorCodes.invalidInput, errorMessage: "The bash input is invalid." })

  const disabledRegistry = toolRegistryCreate()
  expect(registryRegister(disabledRegistry, { enabled: false }).success).toBe(true)
  const disabled = await disabledRegistry.execute("bash", { value: "run" }, context())
  expect(disabled).toMatchObject({ code: toolErrorCodes.disabled, errorMessage: "The bash tool is disabled." })
  expect(disabledRegistry.list()).toEqual([])
})

test("validates output and enforces its output bound", async () => {
  const invalidOutputRegistry = toolRegistryCreate()
  expect(
    registryRegister(invalidOutputRegistry, {
      execute: () => createResult({ wrong: "shape" }),
    }).success,
  ).toBe(true)
  const invalidOutput = await invalidOutputRegistry.execute("bash", { value: "run" }, context())
  expect(invalidOutput).toMatchObject({ code: toolErrorCodes.invalidOutput })

  const boundedRegistry = toolRegistryCreate()
  expect(registryRegister(boundedRegistry).success).toBe(true)
  const bounded = await boundedRegistry.execute(
    "bash",
    { value: "12345" },
    context(new AbortController().signal, { outputLimit: 10 }),
  )
  expect(bounded).toMatchObject({
    code: toolErrorCodes.outputLimit,
    errorMessage: "The bash output exceeded the limit.",
  })
})

test("propagates supplied abort signals before and during execution", async () => {
  let calls = 0
  const registry = toolRegistryCreate()
  expect(
    registryRegister(registry, {
      execute: (_input, signal) => {
        calls += 1
        return new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve(createResult({ result: "aborted" })), { once: true })
        })
      },
    }).success,
  ).toBe(true)

  const beforeController = new AbortController()
  beforeController.abort()
  const before = await registry.execute("bash", { value: "run" }, context(beforeController.signal))
  expect(before).toMatchObject({ code: toolErrorCodes.aborted })
  expect(calls).toBe(0)

  const duringController = new AbortController()
  const execution = registry.execute("bash", { value: "run" }, context(duringController.signal))
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  duringController.abort()
  const during = await execution
  expect(during).toMatchObject({ code: toolErrorCodes.aborted })
  expect(calls).toBe(1)
})

test("returns a deterministic timeout failure and aborts the tool signal", async () => {
  let aborted = false
  const registry = toolRegistryCreate()
  expect(
    registryRegister(registry, {
      execute: (_input, signal) =>
        new Promise(() => {
          signal.addEventListener("abort", () => {
            aborted = true
          })
        }),
    }).success,
  ).toBe(true)

  const result = await registry.execute(
    "bash",
    { value: "run" },
    context(new AbortController().signal, { timeoutMs: 1 }),
  )
  expect(result).toMatchObject({ code: toolErrorCodes.timeout, errorMessage: "The bash execution timed out." })
  expect(aborted).toBe(true)
})

test("allows a caller-owned abort signal to provide the lifecycle deadline", async () => {
  const registry = toolRegistryCreate()
  let callbackAborted = false
  expect(
    registryRegister(registry, {
      execute: (_input, signal) =>
        new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              callbackAborted = true
              resolve(createResult({ result: "aborted" }))
            },
            { once: true },
          )
        }),
    }).success,
  ).toBe(true)

  const controller = new AbortController()
  const execution = registry.execute("bash", { value: "run" }, context(controller.signal, { timeoutMs: null }))
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  controller.abort()
  const result = await execution
  expect(result).toMatchObject({ code: toolErrorCodes.aborted })
  expect(callbackAborted).toBe(true)
})

test("maps executor failures to a stable structured failure", async () => {
  const registry = toolRegistryCreate()
  expect(
    registryRegister(registry, {
      execute: () => {
        throw new Error("secret implementation detail")
      },
    }).success,
  ).toBe(true)

  const result = await registry.execute("bash", { value: "run" }, context())
  expect(result).toMatchObject({ code: toolErrorCodes.executionFailed, errorMessage: "The bash execution failed." })
  expect(JSON.stringify(result)).not.toContain("secret implementation detail")
})

test("rejects malformed executor failures", async () => {
  const registry = toolRegistryCreate()
  expect(
    registryRegister(registry, {
      execute: () => ({ success: false }) as Result<unknown>,
    }).success,
  ).toBe(true)

  const result = await registry.execute("bash", { value: "run" }, context())
  expect(result).toMatchObject({ code: toolErrorCodes.executionFailed })
})
