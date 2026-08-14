#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)

if [[ -z "${GIT_STORE_CHECKOUT+x}" && -f "$root/.env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?GIT_STORE_CHECKOUT[[:space:]]*=(.*)$ ]] || continue
    value=${BASH_REMATCH[2]}
    if [[ "$value" == \"*" && "$value" == *\" ]]; then
      value=${value:1:${#value}-2}
    elif [[ "$value" == \'*" && "$value" == *\' ]]; then
      value=${value:1:${#value}-2}
    fi
    GIT_STORE_CHECKOUT=$value
    break
  done < "$root/.env"
fi

checkout=${GIT_STORE_CHECKOUT:-/home/david/adaptive/git-store}
fail() {
  printf 'git-store-link: %s\n' "$1" >&2
  exit 1
}

command -v bun >/dev/null 2>&1 || fail 'bun is required'
[[ -d "$checkout" ]] || fail "git-store checkout not found: $checkout"
[[ -f "$checkout/package.json" ]] || fail "git-store package not found: $checkout/package.json"

verify_link() {
  local linked_package
  [[ -L "$root/node_modules/@adaptive-ds/git-store" ]] || fail 'Codeline @adaptive-ds/git-store is not a Bun link'
  linked_package=$(readlink -f "$root/node_modules/@adaptive-ds/git-store")
  [[ "$linked_package" == "$(readlink -f "$checkout")" ]] ||
    fail "@adaptive-ds/git-store resolves to $linked_package, expected $checkout"
  [[ -f "$checkout/dist/index.js" ]] || fail "git-store is not built: $checkout/dist/index.js"
}

setup() {
  local bun_config
  bun_config=$(mktemp)
  trap 'rm -f "$bun_config"' RETURN
  (cd "$checkout" && bun install)
  (cd "$checkout" && bun run build)
  (cd "$checkout" && bun --config "$bun_config" link)
  (cd "$root" && bun --config "$bun_config" link @adaptive-ds/git-store)
  verify_link
}

case "${1:-verify}" in
  setup) setup ;;
  verify) verify_link ;;
  *) fail "usage: $0 {setup|verify}" ;;
esac
