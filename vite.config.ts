import tailwindcss from "@tailwindcss/vite"
import { resolve } from "node:path"
import { defineConfig, loadEnv } from "vite"
import solid from "vite-plugin-solid"

const solidUiRoot = resolve(import.meta.dirname, "../solid-ui/ui")
const dependenciesRoot = resolve(import.meta.dirname, "node_modules")

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "")
  const apiPort = Number(env.PORT ?? 3000)
  const solidRuntime = mode === "development" ? "solid-js/dist/dev.js" : "solid-js/dist/solid.js"

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
        { find: /^solid-js\/web$/, replacement: resolve(dependenciesRoot, "solid-js/web/dist/web.js") },
        { find: "clsx", replacement: resolve(dependenciesRoot, "clsx") },
        { find: "tailwind-merge", replacement: resolve(dependenciesRoot, "tailwind-merge") },
      ],
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": `http://127.0.0.1:${apiPort}`,
      },
    },
    build: {
      outDir: "dist/ui",
      emptyOutDir: false,
    },
  }
})
