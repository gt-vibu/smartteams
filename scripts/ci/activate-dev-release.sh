#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="$1"
RELEASE_ID="$2"
SECRET_ID="$3"
AWS_REGION_NAME="$4"
DEPLOY_USER="$5"
SERVICE="$6"

case "$SERVICE" in
  api|web-org|web-admin) ;;
  *) echo "Unsupported service: $SERVICE" >&2; exit 2 ;;
esac

INCOMING_SERVICE_DIR="$DEPLOY_ROOT/incoming/$RELEASE_ID/$SERVICE"
RELEASE_DIR="$DEPLOY_ROOT/releases/$RELEASE_ID"
SERVICE_RELEASE_DIR="$RELEASE_DIR/$SERVICE"
SHARED_DIR="$DEPLOY_ROOT/shared"
LOCK_FILE="$DEPLOY_ROOT/$SERVICE.deploy.lock"
PM2_SAVE_LOCK_FILE="$DEPLOY_ROOT/pm2.save.lock"
# The start script of the last release that passed its health check. A failed release restarts it,
# so a bad deploy does not leave the service down.
ACTIVE_FILE="$DEPLOY_ROOT/$SERVICE.active"

test -d "$INCOMING_SERVICE_DIR"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
  "$DEPLOY_ROOT/incoming" "$DEPLOY_ROOT/releases" "$SHARED_DIR"

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "$SERVICE deployment is already running" >&2; exit 1; }

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$RELEASE_DIR"
rm -rf "$SERVICE_RELEASE_DIR"
mv "$INCOMING_SERVICE_DIR" "$SERVICE_RELEASE_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$SERVICE_RELEASE_DIR"

if [ "$SERVICE" = api ]; then
  secret_string="$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_ID" \
    --region "$AWS_REGION_NAME" \
    --query SecretString \
    --output text)"

  test -n "$secret_string"
  secret_tmp="$SHARED_DIR/.env.tmp.$$"
  if printf '%s' "$secret_string" | jq -e 'type == "object"' >/dev/null 2>&1; then
    printf '%s' "$secret_string" | jq -r 'to_entries[] | "\(.key)=\(.value | tostring)"' > "$secret_tmp"
  else
    printf '%s\n' "$secret_string" > "$secret_tmp"
  fi

  grep -q '^DATABASE_URL=' "$secret_tmp"
  grep -q '^CORS_ORIGINS=' "$secret_tmp"
  chmod 600 "$secret_tmp"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$secret_tmp"
  mv -f "$secret_tmp" "$SHARED_DIR/.env"
fi

# How long PM2 waits after SIGINT before SIGKILL. Its default is 1.6 s; a payroll calculation is one
# transaction bounded by PAYROLL_TRANSACTION_TIMEOUT_MS (120 s), so the API gets longer than that.
KILL_TIMEOUT_MS=10000
[ "$SERVICE" = api ] && KILL_TIMEOUT_MS=130000

case "$SERVICE" in
  api)
    PORT=3010
    PM2_NAME=smarteam-api-dev
    LEGACY_PM2_NAME=smartteams-api
    START_COMMAND="exec env -i HOME=/home/$DEPLOY_USER PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin API_PORT=$PORT node --env-file=$SHARED_DIR/.env $SERVICE_RELEASE_DIR/dist/main.js"
    HEALTH_URL="http://127.0.0.1:$PORT/health/live"
    ;;
  web-org)
    PORT=3011
    PM2_NAME=smarteam-web-org-dev
    LEGACY_PM2_NAME=smartteams-frontend
    START_COMMAND="cd '$SERVICE_RELEASE_DIR' && exec env NODE_ENV=production PORT=$PORT node '$SERVICE_RELEASE_DIR/node_modules/next/dist/bin/next' start --port $PORT"
    HEALTH_URL="http://127.0.0.1:$PORT/"
    ;;
  web-admin)
    PORT=3012
    PM2_NAME=smarteam-web-admin-dev
    LEGACY_PM2_NAME=""
    START_COMMAND="cd '$SERVICE_RELEASE_DIR' && exec env NODE_ENV=production PORT=$PORT node '$SERVICE_RELEASE_DIR/node_modules/next/dist/bin/next' start --port $PORT"
    HEALTH_URL="http://127.0.0.1:$PORT/"
    ;;
esac

START_FILE="$SERVICE_RELEASE_DIR/start.sh"
cat > "$START_FILE" <<EOF
#!/usr/bin/env bash
set -euo pipefail
$START_COMMAND
EOF
chmod 750 "$START_FILE"
chown "$DEPLOY_USER:$DEPLOY_USER" "$START_FILE"

run_as_service_user() {
  runuser -u "$DEPLOY_USER" -- env HOME="/home/$DEPLOY_USER" PM2_HOME="/home/$DEPLOY_USER/.pm2" bash -lc "$1"
}

if [ "$SERVICE" = api ]; then
  echo "Running Prisma database migrations..."
  run_as_service_user "cd '$SERVICE_RELEASE_DIR' && DATABASE_URL=\"\$(sed -n 's/^DATABASE_URL=//p' '$SHARED_DIR/.env')\" '$SERVICE_RELEASE_DIR/node_modules/.bin/prisma' migrate deploy --config prisma.config.ts"
fi

save_pm2_state() {
  (
    exec 8>"$PM2_SAVE_LOCK_FILE"
    flock 8
    run_as_service_user "pm2 save"
  )
}

previous_start=""
if [ -f "$ACTIVE_FILE" ]; then
  previous_start="$(cat "$ACTIVE_FILE")"
  [ -f "$previous_start" ] && [ "$previous_start" != "$START_FILE" ] || previous_start=""
fi

legacy_was_running=false
if run_as_service_user "pm2 describe '$PM2_NAME' >/dev/null 2>&1"; then
  run_as_service_user "pm2 delete '$PM2_NAME' >/dev/null 2>&1 || true"
elif [ -n "$LEGACY_PM2_NAME" ] && run_as_service_user "pm2 describe '$LEGACY_PM2_NAME' >/dev/null 2>&1"; then
  run_as_service_user "pm2 stop '$LEGACY_PM2_NAME' >/dev/null 2>&1 || true"
  legacy_was_running=true
fi

run_as_service_user "pm2 start '$START_FILE' --name '$PM2_NAME' --kill-timeout $KILL_TIMEOUT_MS"

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done

if [ "$healthy" != true ]; then
  run_as_service_user "pm2 delete '$PM2_NAME' >/dev/null 2>&1 || true"
  if [ "$legacy_was_running" = true ]; then
    run_as_service_user "pm2 restart '$LEGACY_PM2_NAME' >/dev/null 2>&1 || true"
    echo "Smart Team $SERVICE health check failed; the legacy service was restarted." >&2
  elif [ -n "$previous_start" ]; then
    run_as_service_user "pm2 start '$previous_start' --name '$PM2_NAME' --kill-timeout $KILL_TIMEOUT_MS"
    save_pm2_state
    echo "Smart Team $SERVICE health check failed; the previous release was restarted." >&2
  else
    echo "Smart Team $SERVICE health check failed; no previous release is recorded, so none is running." >&2
  fi
  exit 1
fi
printf '%s\n' "$START_FILE" > "$ACTIVE_FILE"
chown "$DEPLOY_USER:$DEPLOY_USER" "$ACTIVE_FILE"

if [ "$legacy_was_running" = true ]; then
  run_as_service_user "pm2 delete '$LEGACY_PM2_NAME' >/dev/null 2>&1 || true"
fi
save_pm2_state
rm -f "/tmp/smarteam-activate-$RELEASE_ID-$SERVICE.sh"
echo "Smart Team dev $SERVICE release $RELEASE_ID is healthy."
