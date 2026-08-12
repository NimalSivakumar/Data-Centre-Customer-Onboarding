#!/usr/bin/env bash
set -euo pipefail

APP_NAME="dc-onboarding"
SERVICE_NAME="${BACKEND_SERVICE_NAME:-dc-onboarding}"

: "${STAGING_PATH:?STAGING_PATH is required}"

BUNDLE="$(ls -1 ${APP_NAME}-*.tar.gz | tail -n 1)"
if [ -z "$BUNDLE" ]; then
  echo "No release bundle found"
  exit 1
fi

RELEASES_DIR="$STAGING_PATH/releases"
CURRENT_DIR="$STAGING_PATH/current"
ENV_FILE="$STAGING_PATH/backend/.env"
RELEASE_ID="$(date +%Y%m%d%H%M%S)-${GITHUB_SHA:-local}"
TARGET_RELEASE="$RELEASES_DIR/$RELEASE_ID"

mkdir -p "$RELEASES_DIR" "$TARGET_RELEASE"
tar xzf "$BUNDLE" -C "$TARGET_RELEASE" --strip-components=1

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"
  echo "Create this file on the server with DATABASE_URL, SECRET_KEY, CORS_ORIGINS, and related backend settings."
  exit 1
fi

ln -sfn "$ENV_FILE" "$TARGET_RELEASE/backend/.env"

pushd "$TARGET_RELEASE/backend" >/dev/null
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

HEAD_COUNT="$(alembic heads | sed '/^$/d' | wc -l)"
if [ "$HEAD_COUNT" -ne 1 ]; then
  echo "Expected exactly one Alembic head, found $HEAD_COUNT"
  alembic heads
  exit 1
fi

TARGET_REVISION="$(alembic heads | awk '{print $1}')"
printf "%s\n" "$TARGET_REVISION" > "$TARGET_RELEASE/ALEMBIC_TARGET"

alembic upgrade head
popd >/dev/null

ln -sfn "$TARGET_RELEASE" "$CURRENT_DIR"

sudo systemctl restart "$SERVICE_NAME"
sudo systemctl reload nginx

find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort | head -n -5 | xargs -r rm -rf

echo "Deployment complete: $RELEASE_ID"
