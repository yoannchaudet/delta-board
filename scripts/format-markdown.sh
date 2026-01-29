#!/usr/bin/env bash

# Format all markdown files in the repository
# - README.md at the root
# - All markdown files under the docs folder

set -e

# Get the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Formatting markdown files..."

# Format README.md at the root
if [ -f "$REPO_ROOT/README.md" ]; then
  npx prettier --write "$REPO_ROOT/README.md"
fi

# Format all markdown files under docs/
if [ -d "$REPO_ROOT/docs" ]; then
  find "$REPO_ROOT/docs" -name "*.md" -type f | while read -r file; do
    npx prettier --write "$file"
  done
fi

echo "Done!"
