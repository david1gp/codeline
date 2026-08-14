import { expect, test } from "bun:test"
import { connectionDisconnectedDurationFormat } from "./connectionDisconnectedDurationFormat.js"

test("connectionDisconnectedDurationFormat reports minutes and seconds", () => {
  expect(connectionDisconnectedDurationFormat(0, 65_000)).toBe("1m 5s")
})
