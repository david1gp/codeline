#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)
zero_path="$root/node_modules/@rocicorp/zero"

fail() {
  printf 'zero-registry: %s\n' "$1" >&2
  exit 1
}

command -v bun >/dev/null 2>&1 || fail 'bun is required'

verify_registry() {
  local bun_config
  [[ -e "$zero_path" ]] || fail "installed Zero package not found: $zero_path"
  [[ ! -L "$zero_path" ]] || fail 'Zero is still linked; install the registry package instead'
  bun_config=$(mktemp)
  trap 'rm -f "${bun_config:-}"' RETURN
  (cd "$root" && bun --config "$bun_config" -e '
    const packageJson = await Bun.file("package.json").json()
    const dependency = packageJson.dependencies?.["@rocicorp/zero"]
    if (typeof dependency !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(dependency)) {
      throw new Error("package.json does not pin @rocicorp/zero to an exact version")
    }
    const installed = await Bun.file("node_modules/@rocicorp/zero/package.json").json()
    if (installed.version !== dependency) {
      throw new Error(`installed @rocicorp/zero is ${installed.version}, expected ${dependency}`)
    }
    const zero = await import("@rocicorp/zero")
    await import("@rocicorp/zero/solid")
    const schema = zero.table("registryCheck").columns({id: zero.string()}).primaryKey("id")
    if (typeof schema.unique !== "function") throw new Error("installed Zero schema API does not expose table.unique()")
    schema.unique("id")
  ') || fail 'registry package verification failed'
}

setup() {
  (cd "$root" && bun install) || fail 'bun install failed'
  verify_registry
}

case "${1:-verify}" in
  setup) setup ;;
  verify) verify_registry ;;
  *) fail "usage: $0 {setup|verify}" ;;
esac
