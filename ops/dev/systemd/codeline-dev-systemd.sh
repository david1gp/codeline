#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)
unit_dir=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
template_dir="$script_dir"

fail() {
  printf 'codeline-dev-systemd: %s\n' "$1" >&2
  exit 1
}

command -v systemctl >/dev/null 2>&1 || fail 'systemctl is required'
command -v bun >/dev/null 2>&1 || fail 'bun is required'
mkdir -p "$unit_dir"

install_units() {
  local bun_path template target
  bun_path=$(command -v bun)
  for template in "$template_dir"/*.in; do
    target="$unit_dir/$(basename "${template%.in}")"
    sed -e "s|@ROOT@|$root|g" -e "s|@BUN@|$bun_path|g" "$template" > "$target"
  done
  systemctl --user daemon-reload
  systemctl --user enable codeline-dev.target
}

remove_units() {
  systemctl --user disable --now codeline-dev.target 2>/dev/null || true
  rm -f "$unit_dir/codeline-dev.target" \
    "$unit_dir/codeline-dev-postgres.service" \
    "$unit_dir/codeline-dev-zero-cache.service" \
    "$unit_dir/codeline-dev-api.service" \
    "$unit_dir/codeline-dev-ui.service"
  systemctl --user daemon-reload
}

case "${1:-help}" in
  install) install_units ;;
  remove|uninstall) remove_units ;;
  start) systemctl --user start codeline-dev.target ;;
  stop) systemctl --user stop codeline-dev.target ;;
  restart) systemctl --user restart codeline-dev.target ;;
  status) systemctl --user status codeline-dev.target codeline-dev-postgres.service codeline-dev-zero-cache.service codeline-dev-api.service codeline-dev-ui.service --no-pager ;;
  enable) systemctl --user enable codeline-dev.target ;;
  disable) systemctl --user disable codeline-dev.target ;;
  help)
    printf 'Usage: ops/dev/systemd/codeline-dev-systemd.sh {install|remove|start|stop|restart|status|enable|disable}\n'
    ;;
  *) fail "unknown command: $1" ;;
esac
