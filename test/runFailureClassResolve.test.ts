import { expect, test } from "bun:test"
import { runFailureClassResolve } from "../src/run/actions/runFailureClassResolve.js"

test("classifies stream idle timeout as retryable", () => {
  expect(runFailureClassResolve({ code: "stream_idle_timeout", message: "The stream went idle." })).toBe("retryable")
})
