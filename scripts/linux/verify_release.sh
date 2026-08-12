#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${BACKEND_SERVICE_NAME:-dc-onboarding}"

: "${STAGING_PATH:?STAGING_PATH is required}"
: "${STAGING_BASE_URL:?STAGING_BASE_URL is required}"

CURRENT_DIR="$STAGING_PATH/current"
BASE_URL="${STAGING_BASE_URL%/}"
FRONTEND_URL="$BASE_URL/dc-onboarding/"
HEALTH_URL="$BASE_URL/dc-onboarding-api/health"
READY_URL="$BASE_URL/dc-onboarding-api/health/ready"

curl -kfsS "$FRONTEND_URL" >/dev/null
curl -kfsS "$HEALTH_URL" >/dev/null

curl -kfsS "$READY_URL" >/dev/null

systemctl is-active --quiet "$SERVICE_NAME"

ACTIVE_TIMESTAMP="$(systemctl show "$SERVICE_NAME" --property=ActiveEnterTimestamp --value)"
if [ -z "$ACTIVE_TIMESTAMP" ]; then
  echo "Could not read backend service active timestamp"
  exit 1
fi
echo "Backend service active since: $ACTIVE_TIMESTAMP"

if [ -f "$CURRENT_DIR/ALEMBIC_TARGET" ]; then
  pushd "$CURRENT_DIR/backend" >/dev/null
  . .venv/bin/activate
  TARGET_REVISION="$(cat "$CURRENT_DIR/ALEMBIC_TARGET")"
  CURRENT_REVISION="$(alembic current | awk '{print $1}')"
  if [ "$CURRENT_REVISION" != "$TARGET_REVISION" ]; then
    echo "Alembic revision mismatch. Current: $CURRENT_REVISION Target: $TARGET_REVISION"
    exit 1
  fi
  popd >/dev/null
fi

if [ -f "$CURRENT_DIR/REVISION" ]; then
  echo "Deployed revision: $(cat "$CURRENT_DIR/REVISION")"
fi

echo "Verification passed"
