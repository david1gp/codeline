#!/usr/bin/env bash
set -euo pipefail

echo "Running the local Codeline deployment preflight."
bun run build
echo "Build complete. No remote deployment is configured in the repository bootstrap."
