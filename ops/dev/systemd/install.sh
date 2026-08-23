#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)
config_dir=${XDG_CONFIG_HOME:-$HOME/.config}
unit_dir="$config_dir/systemd/user"
stable_checkout="$HOME/codeline"

fail() {
  printf 'codeline-dev-systemd: %s\n' "$1" >&2
  exit 1
}

command -v systemctl >/dev/null 2>&1 || fail 'systemctl is required'

install_units() {
  local unit
  if [[ "$root" != "$stable_checkout" ]]; then
    ln -sfn "$root" "$stable_checkout"
    printf 'linked %s -> %s\n' "$stable_checkout" "$root"
  fi

  mkdir -p "$unit_dir"
  for unit in codeline-dev-api.service codeline-dev-ui.service codeline-dev.target; do
    ln -sf "$script_dir/$unit" "$unit_dir/$unit"
    printf 'linked %s\n' "$unit"
  done

  # Preparation only: do not enable or start any unit here. The final cutover
  # explicitly enables codeline-dev.target after the environment is validated.
  systemctl --user daemon-reload
}

remove_units() {
  local unit
  for unit in codeline-dev-api.service codeline-dev.target codeline-dev-ui.service; do
    rm -f "$unit_dir/$unit"
  done
  systemctl --user daemon-reload
}

case "${1:-help}" in
  install) install_units ;;
  remove|uninstall) remove_units ;;
  help)
    printf 'Usage: ops/dev/systemd/install.sh {install|remove|help}\n'
    ;;
  *) fail "unknown command: $1" ;;
esac
