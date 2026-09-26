import * as v from "valibot"

/** Keep the bearer out of browser contexts and never follow a redirect with it. */
export async function e2eFixtureRequest<T extends v.GenericSchema>(
  origin: string,
  token: string,
  path: string,
  schema: T,
  method = "GET",
  body?: unknown,
): Promise<v.InferOutput<T>> {
  const response = await fetch(`${origin}/api/_e2e/fixtures/runs${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    cache: "no-store",
  })
  if (!response.ok)
    throw new Error(
      `E2E fixture ${method} ${path || "/"} failed (${response.status}); registered resources require verified cleanup`,
    )
  return v.parse(schema, (await response.json()) as unknown)
}
