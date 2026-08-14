export function oidcCallbackRequestUrlResolve(configuredCallback: URL, requestUrl: URL): URL {
  const callbackRequestUrl = new URL(configuredCallback.origin)
  callbackRequestUrl.pathname = requestUrl.pathname
  callbackRequestUrl.search = requestUrl.search
  return callbackRequestUrl
}
