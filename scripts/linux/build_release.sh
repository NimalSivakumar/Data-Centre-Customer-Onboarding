#!/usr/bin/env bash
set -euo pipefail

APP_NAME="dc-onboarding"
BUILD_ROOT=".release-build"
RELEASE_DIR="$BUILD_ROOT/release"
REVISION="${GITHUB_SHA:-local}"
BUNDLE_NAME="${APP_NAME}-${REVISION}.tar.gz"

rm -rf "$BUILD_ROOT" "$BUNDLE_NAME"
mkdir -p "$RELEASE_DIR/backend" "$RELEASE_DIR/frontend"

pushd frontend >/dev/null
npm ci
VITE_BASE_PATH="${VITE_BASE_PATH:-/dc-onboarding/}" \
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/dc-onboarding-api/v1}" \
npm run build
popd >/dev/null

rsync -a backend/ "$RELEASE_DIR/backend/" \
  --exclude ".env" \
  --exclude ".venv" \
  --exclude "__pycache__" \
  --exclude "*.pyc"

rsync -a frontend/dist/ "$RELEASE_DIR/frontend/"

printf "%s\n" "$REVISION" > "$RELEASE_DIR/REVISION"

tar czf "$BUNDLE_NAME" -C "$BUILD_ROOT" release

echo "Built release bundle: $BUNDLE_NAME"
