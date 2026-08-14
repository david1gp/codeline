import { expect, test } from "bun:test"
import { finalizedMessageCopyAttempt } from "../src/message/ui/finalizedMessageCopyAttempt.js"

test("finalized message copy writes the plain source and reports success", async () => {
  const writes: string[] = []
  const status = await finalizedMessageCopyAttempt({
    content: "**Markdown** source",
    writeText: async (text) => {
      writes.push(text)
    },
  })

  expect(writes).toEqual(["**Markdown** source"])
  expect(status).toBe("copied")
})

test("finalized message copy reports unavailable and rejected clipboard access", async () => {
  const unavailable = await finalizedMessageCopyAttempt({ content: "message" })
  const rejected = await finalizedMessageCopyAttempt({
    content: "message",
    writeText: () => Promise.reject(new Error("denied")),
  })

  expect(unavailable).toBe("error")
  expect(rejected).toBe("error")
})
