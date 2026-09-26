import * as v from "valibot"

const sessionSidebarProjectLabelOverridesSchema = v.record(v.string(), v.pipe(v.string(), v.trim(), v.minLength(1)))
const storageKey = "codeline.projectLabels"

export function sessionSidebarProjectLabelOverridesLoad(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): Record<string, string> {
  try {
    const parsed = v.safeParse(
      sessionSidebarProjectLabelOverridesSchema,
      JSON.parse(storage?.getItem(storageKey) ?? "null"),
    )
    return parsed.success ? parsed.output : {}
  } catch (_error) {
    return {}
  }
}
