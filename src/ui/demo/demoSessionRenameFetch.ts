/**
 * Accepts rename requests locally so the real rename control stays interactive
 * in the catalog without an API.
 */
export function demoSessionRenameFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const body = typeof init?.body === "string" ? init.body : "{}"
  return Promise.resolve(new Response(body, { headers: { "content-type": "application/json" }, status: 200 }))
}
