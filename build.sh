#!/bin/bash
set -e

echo "=== Build Script Started ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"
echo ""

echo "=== Checking TypeScript installation ==="
if [ -f "./node_modules/.bin/tsc" ]; then
    echo "✓ TypeScript found"
    ./node_modules/.bin/tsc --version
else
    echo "✗ TypeScript NOT found"
    exit 1
fi

echo ""
echo "=== Starting TypeScript compilation ==="
if node --max-old-space-size=2048 ./node_modules/.bin/tsc; then
    echo "✓ TypeScript compilation successful"
else
    echo "✗ TypeScript compilation FAILED with exit code: $?"
    exit 1
fi

echo ""
echo "=== Running tsc-alias ==="
if npx tsc-alias; then
    echo "✓ tsc-alias successful"
else
    echo "✗ tsc-alias FAILED with exit code: $?"
    exit 1
fi

echo ""
echo "=== Build Complete ==="
echo "Listing dist directory:"
ls -la dist/ || echo "dist directory not found"
