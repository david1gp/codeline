import { pageRouteDemo } from "./pageRouteDemo.js"

export function urlDemo() {
  return pageRouteDemo.demo
}

export function urlDemoSection(sectionSlug: string) {
  return `${pageRouteDemo.demo}/${encodeURIComponent(sectionSlug)}`
}

export function urlDemoItem(sectionSlug: string, itemSlug: string) {
  return `${pageRouteDemo.demo}/${encodeURIComponent(sectionSlug)}/${encodeURIComponent(itemSlug)}`
}

export function urlDemoUnknown(rest: string) {
  if (!rest) return pageRouteDemo.demo
  const encoded = rest
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return pageRouteDemo.demoUnknown.replace("*unknownDemo", encoded)
}
