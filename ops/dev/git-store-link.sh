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

checkout=${GIT_STORE_CHECKOUT:-"$root/../git-store-clean-779c05b"}
fail() {
  printf 'git-store-link: %s\n' "$1" >&2
  exit 1
}

command -v bun >/dev/null 2>&1 || fail 'bun is required'
[[ -d "$checkout" ]] || fail "git-store checkout not found: $checkout"
[[ -f "$checkout/package.json" ]] || fail "git-store package not found: $checkout/package.json"

verify_link() {
  bun "$root/scripts/releaseInputsVerify.ts" --root "$root" --input git-store || fail 'release-input manifest verification failed'
}

setup() {
  local bun_config
  bun_config=$(mktemp)
  trap 'rm -f "$bun_config"' RETURN
  (cd "$checkout" && bun install)
  (cd "$checkout" && bun run build)
  (cd "$checkout" && bun link)
  if [[ -L "$root/node_modules/@adaptive-ds/git-store" ]]; then
    local linked_package
    linked_package=$(readlink -f "$root/node_modules/@adaptive-ds/git-store")
    [[ "$linked_package" == "$(readlink -f "$checkout")" ]] || rm "$root/node_modules/@adaptive-ds/git-store"
  fi
  (cd "$root" && bun link @adaptive-ds/git-store)
  verify_link
}

case "${1:-verify}" in
  setup) setup ;;
  verify) verify_link ;;
  *) fail "usage: $0 {setup|verify}" ;;
esac
