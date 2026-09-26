import { createContext } from "solid-js"

export const apiFetchContext = createContext<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
