#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)

if [[ -z "${ZERO_CHECKOUT+x}" && -f "$root/.env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?ZERO_CHECKOUT[[:space:]]*=(.*)$ ]] || continue
    value=${BASH_REMATCH[2]}
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value=${value:1:${#value}-2}
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value=${value:1:${#value}-2}
    fi
    ZERO_CHECKOUT=$value
    break
  done < "$root/.env"
fi

checkout=${ZERO_CHECKOUT:-/home/david/opensource/zero}
package_dir="$checkout/packages/zero"
expected_commit=25ece7f96167f503bf0d59f719cbbc17098bfa3f
expected_pnpm=11.11.0
expected_version=1.10.0

fail() {
  printf 'zero-link: %s\n' "$1" >&2
  exit 1
}

command -v bun >/dev/null 2>&1 || fail 'bun is required'
[[ -d "$checkout" ]] || fail "Zero checkout not found: $checkout"
[[ -f "$package_dir/package.json" ]] || fail "Zero package not found: $package_dir"

verify_link() {
  local linked_package
  local bun_config
  [[ "$(git -C "$checkout" rev-parse HEAD)" == "$expected_commit" ]] ||
    fail "Zero checkout is not at pinned commit $expected_commit"
  bun_config=$(mktemp)
  trap 'rm -f "$bun_config"' RETURN
  [[ -L "$root/node_modules/@rocicorp/zero" ]] || fail 'Codeline @rocicorp/zero is not a Bun link'
  linked_package=$(readlink -f "$root/node_modules/@rocicorp/zero")
  [[ "$linked_package" == "$(readlink -f "$package_dir")" ]] ||
   fail "@rocicorp/zero resolves to $linked_package, expected $package_dir"
  ZERO_PACKAGE_JSON="$package_dir/package.json" ZERO_VERSION="$expected_version" bun --config "$bun_config" -e '
    const fs = require("node:fs");
    const packageJSON = JSON.parse(fs.readFileSync(process.env.ZERO_PACKAGE_JSON, "utf8"));
    if (packageJSON.name !== "@rocicorp/zero" || packageJSON.version !== process.env.ZERO_VERSION) {
      throw new Error(`unexpected package identity: ${packageJSON.name}@${packageJSON.version}`);
    }
    for (const [subpath, target] of Object.entries(packageJSON.exports)) {
      const targetPath = typeof target === "string" ? target : target?.default;
      if (!targetPath || !fs.existsSync(`${process.env.ZERO_PACKAGE_JSON.replace(/package\.json$/, "")}/${targetPath}`)) {
        throw new Error(`missing built export ${subpath}`);
      }
    }
    const zero = await import("@rocicorp/zero");
    await import("@rocicorp/zero/solid");
    const schema = zero.table("linkCheck").columns({id: zero.string()}).primaryKey("id");
    if (typeof schema.unique !== "function") {
      throw new Error("latest Zero schema API does not expose table.unique()");
    }
    schema.unique("id");
  '
}

setup() {
  local bun_config
  bun_config=$(mktemp)
  trap 'rm -f "$bun_config"' RETURN
  if [[ ! -f "$package_dir/out/zero/src/zero.js" || ! -f "$package_dir/out/zero/src/solid.js" ]]; then
    [[ "$(cd "$checkout" && bun --config "$bun_config" x "pnpm@$expected_pnpm" --version)" == "$expected_pnpm" ]] || fail "expected pnpm@$expected_pnpm"
    (cd "$checkout" && bun --config "$bun_config" x "pnpm@$expected_pnpm" install --frozen-lockfile)
    (cd "$checkout" && bun --config "$bun_config" x "pnpm@$expected_pnpm" --filter '@rocicorp/zero...' build)
  fi
  (cd "$package_dir" && bun link)
  if [[ -e "$root/node_modules/@rocicorp/zero" && ! -L "$root/node_modules/@rocicorp/zero" ]]; then
    (cd "$root" && bun --config "$bun_config" remove @rocicorp/zero)
  fi
  (cd "$root" && bun --config "$bun_config" link @rocicorp/zero)
  verify_link
}

case "${1:-verify}" in
  setup) setup ;;
  verify) verify_link ;;
  *) fail "usage: $0 {setup|verify}" ;;
esac
