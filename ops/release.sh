#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [version]"
  exit 2
fi

version="${1:-$(bun -e 'console.log((await Bun.file("package.json").json()).version)')}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must use MAJOR.MINOR.PATCH: $version"
  exit 2
fi

echo "Running the local release preflight for v$version."
bun run format:check
bun run test
bun run build
echo "Release preflight passed. This script does not modify Git, publish packages, or contact GitHub."
