import { createComponent, ssrElement } from "solid-js/web"

/**
 * JSX runtime shim for `bun test`.
 *
 * Bun compiles Solid JSX to automatic-runtime imports from
 * `solid-js/jsx-dev-runtime`, but that entry point resolves to Solid's
 * `dist/solid.js`, which exports no `jsx`/`jsxs`/`jsxDEV` helpers (Solid
 * expects its compiler to eliminate JSX at build time). This module provides
 * those helpers on top of `createComponent` and `ssrElement` so tests that
 * transitively load `.tsx` files can run under Bun.
 */

type JsxProps = Record<string, unknown> & {
  children?: unknown
}

function withoutKey(props: JsxProps): JsxProps {
  if (props.key === undefined) return props
  const next = { ...props }
  delete next.key
  return next
}

function renderNode(type: unknown, props: JsxProps | null | undefined): unknown {
  const normalized = withoutKey(props ?? {})
  if (typeof type === "function") return createComponent(type as never, normalized as never)
  return ssrElement(type as string, normalized, normalized.children, false)
}

export function jsx(type: unknown, props: JsxProps | null | undefined): unknown {
  return renderNode(type, props)
}

export function jsxs(type: unknown, props: JsxProps | null | undefined): unknown {
  return renderNode(type, props)
}

export function jsxDEV(type: unknown, props: JsxProps | null | undefined): unknown {
  return renderNode(type, props)
}

export function Fragment(props: JsxProps | null | undefined): unknown {
  return props?.children
}
