import { expect, test } from "bun:test"

test("SessionList wires the load-more view boundary to sidebar pagination state", async () => {
  const source = await Bun.file(new URL("../src/ui/SessionList.tsx", import.meta.url)).text()
  const loadMoreStart = source.indexOf(
    '<Show when={props.state.sidebar.activeTab() !== "search" && props.state.sidebar.canLoadMore()}>',
  )
  const loadMoreEnd = source.indexOf("</Show>", loadMoreStart)
  const loadMoreSource = source.slice(loadMoreStart, loadMoreEnd)

  expect(loadMoreStart).toBeGreaterThan(-1)
  expect(loadMoreEnd).toBeGreaterThan(loadMoreStart)
  expect(loadMoreSource).toContain("disabled={props.state.sidebar.isLoadingMore()}")
  expect(loadMoreSource).toContain("onClick={props.state.sidebar.loadMore}")
  expect(loadMoreSource).toContain('{props.state.sidebar.isLoadingMore() ? "Loading..." : "Load more"}')
})
