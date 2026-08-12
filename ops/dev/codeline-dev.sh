#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)
compose_file="$root/ops/dev/compose.yaml"
env_file="$root/.env"

fail() {
  printf 'codeline-dev: %s\n' "$1" >&2
  exit 1
}

[[ -f "$env_file" ]] || fail "missing $env_file; copy .env.example to .env first"

load_env_file() {
  local line name value
  loaded_env=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] ||
      fail "invalid line in $env_file"
    name=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]}
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value=${value:1:${#value}-2}
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value=${value:1:${#value}-2}
    fi
    export "$name=$value"
    loaded_env["$name"]=1
  done < "$env_file"
}

declare -A loaded_env
load_env_file
ZERO_CHECKOUT=${ZERO_CHECKOUT:-/home/david/opensource/zero}
export ZERO_CHECKOUT

required_env=(
  POSTGRES_DB
  POSTGRES_PASSWORD
  POSTGRES_PORT
  POSTGRES_USER
  DATABASE_URL
  ZERO_ADMIN_PASSWORD
  ZERO_APP_ID
  ZERO_CHANGE_DB
  ZERO_CVR_DB
  ZERO_PORT
  ZERO_REPLICA_FILE
  ZERO_UPSTREAM_DB
)
for name in "${required_env[@]}"; do
  [[ "${loaded_env[$name]:-}" == 1 && -n "${!name:-}" ]] || fail "$name is required in .env"
done
[[ -d "$ZERO_CHECKOUT" ]] || fail "Zero checkout not found: $ZERO_CHECKOUT"

compose() {
  command -v podman >/dev/null 2>&1 || fail "podman is required"
  # Use the user's configured rootless defaults; Codeline must not create custom roots.
  podman compose -f "$compose_file" "$@"
}

usage() {
  cat <<'EOF'
Usage: ops/dev/codeline-dev.sh <command> [args]

Commands:
  build             Build the local Zero image from the sibling checkout; does not start containers.
  config            Resolve Compose configuration without printing it.
  down              Stop and remove containers, keeping named volumes.
  help              Show this help.
  logs [service...] Show service logs; extra arguments pass to Compose.
  migrate           Apply committed Drizzle migrations to local Postgres.
  link-zero         Build and link the pinned local Zero package into Codeline.
  reset             Remove containers and named volumes, deleting local service data.
  start             Start existing containers without recreating them.
  status            Show container status.
  stop              Stop containers without removing them.
  up                Start the local services in detached mode.
  verify-zero       Verify the linked local Zero package.
EOF
}

case "${1:-help}" in
  build) compose build zero-cache ;;
  config) compose config --quiet ;;
  down) compose down --remove-orphans ;;
  help) usage ;;
  logs)
    shift
    compose logs "$@"
    ;;
  migrate) (cd "$root" && bun run db:migrate) ;;
  link-zero)
    bash "$root/ops/dev/zero-link.sh" setup
    ;;
  reset) compose down --remove-orphans --volumes ;;
  start) compose start ;;
  status) compose ps ;;
  stop) compose stop ;;
  up) compose up -d ;;
  verify-zero) bash "$root/ops/dev/zero-link.sh" verify ;;
  *) usage >&2; exit 2 ;;
esac
