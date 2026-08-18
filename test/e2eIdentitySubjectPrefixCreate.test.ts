import { expect, test } from "bun:test"
import { e2eIdentitySubjectPrefixCreate } from "../scripts/e2eIdentitySubjectPrefixCreate.js"

test("the subject prefix stays inside the namespace the purge accepts", () => {
  const prefix = e2eIdentitySubjectPrefixCreate("abc123")
  expect(prefix).toBe("e2e-organization-member-abc123-")
  expect(prefix.startsWith("e2e-organization-member-")).toBe(true)
  expect(prefix.endsWith("-")).toBe(true)
})

test("different runs receive disjoint subject prefixes", () => {
  const first = e2eIdentitySubjectPrefixCreate("runone")
  const second = e2eIdentitySubjectPrefixCreate("runtwo")
  expect(first).not.toBe(second)
  expect(`${first}1`.startsWith(second)).toBe(false)
  expect(`${second}1`.startsWith(first)).toBe(false)
})
