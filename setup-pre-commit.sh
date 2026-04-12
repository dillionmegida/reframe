#!/bin/bash

# Setup script for installing the pre-commit hook
# Run this script after cloning the repository to enable automatic test execution on commits

set -e

HOOK_PATH=".git/hooks/pre-commit"

echo "Setting up pre-commit hook..."

if [ ! -d ".git" ]; then
  echo "Error: Not in a git repository root. Please run this script from the repository root."
  exit 1
fi

cat > "$HOOK_PATH" << 'EOF'
#!/bin/sh

# Run vitest before allowing a commit, but only when relevant files are staged.
# Set SKIP_PRE_COMMIT_TESTS=1 to bypass.

if [ "$SKIP_PRE_COMMIT_TESTS" = "1" ]; then
  echo "SKIP_PRE_COMMIT_TESTS=1 set; skipping tests."
  exit 0
fi

CHANGED_FILES=$(git diff --cached --name-only)

if [ -z "$CHANGED_FILES" ]; then
  echo "No staged changes; skipping tests."
  exit 0
fi

should_run=0
for file in $CHANGED_FILES; do
  case "$file" in
    src/*|electron/*|tests/*)
      should_run=1
      ;;
    package.json|package-lock.json|tsconfig.json|vitest.config.ts|vite.config.*|tailwind.config.js|postcss.config.js|electron.vite.config.ts)
      should_run=1
      ;;
  esac

  if [ $should_run -eq 1 ]; then
    break
  fi
done

if [ $should_run -ne 1 ]; then
  echo "No relevant files changed; skipping tests."
  exit 0
fi

echo "Running tests (npm test)..."
npm test
status=$?

if [ $status -ne 0 ]; then
  echo "Tests failed; aborting commit."
  exit $status
fi

echo "Tests passed."
EOF

chmod +x "$HOOK_PATH"

echo "✓ Pre-commit hook installed successfully at $HOOK_PATH"
echo ""
echo "The hook will run tests automatically when you commit changes to:"
echo "  - src/, electron/, tests/ directories"
echo "  - Build config files (package.json, tsconfig.json, etc.)"
echo ""
echo "To skip tests for a commit, use: SKIP_PRE_COMMIT_TESTS=1 git commit -m \"message\""
