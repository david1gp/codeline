import { httpActionGeneric, httpRouter } from "convex/server"
import { identityHttpOrganizationMemberRequire } from "../src/identity/convex/identityHttpOrganizationMemberRequire.js"
import { identityHttpUserRequire } from "../src/identity/convex/identityHttpUserRequire.js"

const http = httpRouter()

const identitySession = httpActionGeneric(async (context, request) => {
  const result = await identityHttpUserRequire(context, request)
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    status: result.success ? 200 : 401,
  })
})

const identityOrganization = httpActionGeneric(async (context, request) => {
  const url = new URL(request.url)
  const result = await identityHttpOrganizationMemberRequire(
    context,
    request,
    url.searchParams.get("organization") ?? undefined,
    url.searchParams.get("issuer") ?? undefined,
  )
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    status: result.success ? 200 : 401,
  })
})

http.route({ handler: identitySession, method: "GET", path: "/api/identity/session" })
http.route({ handler: identityOrganization, method: "GET", path: "/api/identity/organization" })

export default http
