import * as solidJsxRuntime from "./solidJsxRuntime.js"

Bun.plugin({
  name: "solid-jsx-runtime",
  setup(build) {
    // Bun compiles Solid JSX to automatic-runtime imports, but
    // `solid-js/jsx-dev-runtime` resolves to Solid's `dist/solid.js`, which
    // exports no `jsx`/`jsxs`/`jsxDEV` helpers (Solid expects its compiler to
    // eliminate JSX at build time). Serve the local shim instead so tests
    // that transitively load `.tsx` files can run under `bun test`.
    build.module("solid-js/jsx-dev-runtime", () => ({ loader: "object", exports: solidJsxRuntime }))
    build.module("solid-js/jsx-runtime", () => ({ loader: "object", exports: solidJsxRuntime }))
  },
})
