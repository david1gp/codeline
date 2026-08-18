import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"
import solid from "vite-plugin-solid"
import { oidcCallbackPathResolve } from "./src/configuration/oidcCallbackPathResolve.js"
import { oidcCallbackProxyContextResolve } from "./src/configuration/oidcCallbackProxyContextResolve.js"

const solidUiRoot = resolve(import.meta.dirname, "ui")
const dependenciesRoot = resolve(import.meta.dirname, "node_modules")

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "")
  const apiPort = Number(env.PORT ?? 6001)
  const uiPort = Number(env.UI_PORT ?? 6000)
  const zeroCachePort = Number(env.ZERO_PORT ?? 6003)
  const oidcCallbackPath = oidcCallbackPathResolve(env)
  const solidRuntime = mode === "development" ? "solid-js/dist/dev.js" : "solid-js/dist/solid.js"
  const solidStoreRuntime = mode === "development" ? "solid-js/store/dist/dev.js" : "solid-js/store/dist/store.js"

  return {
    plugins: [solid(), tailwindcss()],
    resolve: {
      alias: [
        { find: "#ui", replacement: solidUiRoot },
        {
          find: "@adaptive-ds/solid-ui/static/badge/Badge",
          replacement: resolve(solidUiRoot, "static/badge/Badge.tsx"),
        },
        {
          find: "@adaptive-ds/solid-ui/static/badge/badgeCva",
          replacement: resolve(solidUiRoot, "static/badge/badgeCva.tsx"),
        },
        {
          find: "@adaptive-ds/solid-ui/utils/createSignalObject",
          replacement: resolve(solidUiRoot, "utils/createSignalObject.ts"),
        },
        { find: /^solid-js$/, replacement: resolve(dependenciesRoot, solidRuntime) },
        { find: /^solid-js\/dist\/solid\.js$/, replacement: resolve(dependenciesRoot, solidRuntime) },
        { find: /^solid-js\/web$/, replacement: resolve(dependenciesRoot, "solid-js/web/dist/web.js") },
        { find: /^solid-js\/store$/, replacement: resolve(dependenciesRoot, solidStoreRuntime) },
        { find: /^@corvu\/popover$/, replacement: resolve(dependenciesRoot, "@corvu/popover") },
        { find: /^@mdi\/js$/, replacement: resolve(dependenciesRoot, "@mdi/js") },
        { find: /^valibot$/, replacement: resolve(dependenciesRoot, "valibot") },
        { find: "clsx", replacement: resolve(dependenciesRoot, "clsx") },
        { find: "tailwind-merge", replacement: resolve(dependenciesRoot, "tailwind-merge") },
      ],
    },
    define: {
      "import.meta.env.VITE_SESSIONS_SIDEBAR_PAGE_SIZE": JSON.stringify(env.SESSIONS_SIDEBAR_PAGE_SIZE ?? "25"),
    },
    server: {
      port: uiPort,
      strictPort: true,
      allowedHosts: ["preview.codeline.work"],
      proxy: {
        ...(oidcCallbackPath === undefined
          ? {}
          : {
              [oidcCallbackProxyContextResolve(oidcCallbackPath)]: `http://127.0.0.1:${apiPort}`,
            }),
        "/api": `http://127.0.0.1:${apiPort}`,
        "/sync": {
          target: `ws://127.0.0.1:${zeroCachePort}`,
          ws: true,
        },
      },
    },
    build: {
      outDir: "dist/ui",
      emptyOutDir: false,
    },
  }
})
