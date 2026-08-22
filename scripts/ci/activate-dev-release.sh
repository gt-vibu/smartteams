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
    START_COMMAND="exec env NODE_ENV=production PORT=$PORT node $SERVICE_RELEASE_DIR/node_modules/next/dist/bin/next start --port $PORT"
    HEALTH_URL="http://127.0.0.1:$PORT/"
    ;;
  web-admin)
    PORT=3012
    PM2_NAME=smarteam-web-admin-dev
    LEGACY_PM2_NAME=""
    START_COMMAND="exec env NODE_ENV=production PORT=$PORT node $SERVICE_RELEASE_DIR/node_modules/next/dist/bin/next start --port $PORT"
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

run_as_deploy_user() {
  runuser -u "$DEPLOY_USER" -- env HOME="/home/$DEPLOY_USER" PM2_HOME="/home/$DEPLOY_USER/.pm2" bash -lc "$1"
}

save_pm2_state() {
  (
    exec 8>"$PM2_SAVE_LOCK_FILE"
    flock 8
    run_as_deploy_user "pm2 save"
  )
}

legacy_was_running=false
if run_as_deploy_user "pm2 describe '$PM2_NAME' >/dev/null 2>&1"; then
  run_as_deploy_user "pm2 delete '$PM2_NAME' >/dev/null 2>&1 || true"
elif [ -n "$LEGACY_PM2_NAME" ] && run_as_deploy_user "pm2 describe '$LEGACY_PM2_NAME' >/dev/null 2>&1"; then
  run_as_deploy_user "pm2 stop '$LEGACY_PM2_NAME' >/dev/null 2>&1 || true"
  legacy_was_running=true
fi

run_as_deploy_user "pm2 start '$START_FILE' --name '$PM2_NAME'"

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done

if [ "$healthy" != true ]; then
  run_as_deploy_user "pm2 delete '$PM2_NAME' >/dev/null 2>&1 || true"
  if [ "$legacy_was_running" = true ]; then
    run_as_deploy_user "pm2 restart '$LEGACY_PM2_NAME' >/dev/null 2>&1 || true"
  fi
  echo "Smart Team $SERVICE health check failed; previous service was restored when available." >&2
  exit 1
fi

if [ "$legacy_was_running" = true ]; then
  run_as_deploy_user "pm2 delete '$LEGACY_PM2_NAME' >/dev/null 2>&1 || true"
fi
save_pm2_state
rm -f "/tmp/smarteam-activate-$RELEASE_ID-$SERVICE.sh"
echo "Smart Team dev $SERVICE release $RELEASE_ID is healthy."
