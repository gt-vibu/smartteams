#!/usr/bin/env bash
# Exercises scripts/ci/activate-dev-release.sh without a server: pm2, curl, aws and the
# root-only commands (install -o, chown, runuser) are stubbed; everything else is the real script.
#
# What it pins:
#   1. A failed release does not take the service down: the last healthy release is started again.
#      The script used to delete the running release before starting the new one and, when the new
#      one failed its health check, restore only a *legacy* process name — so an ordinary failed
#      redeploy left nothing running while reporting that the previous service was restored.
#   2. The API is started with a kill timeout longer than the payroll transaction, so a restart
#      waits for an in-flight calculation instead of killing it after PM2's default 1.6 seconds.
#
#   bash scripts/ci/activate-dev-release.test.sh [path/to/activate-dev-release.sh]
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/activate-dev-release.sh"
[ -n "${1:-}" ] && SCRIPT="$1"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STUBS="$WORK/stubs"
mkdir -p "$STUBS"
export PM2_STATE="$WORK/pm2-running" PM2_LOG="$WORK/pm2.log" HEALTHY_FILE="$WORK/healthy"
: > "$PM2_STATE"

stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$STUBS/$1"; chmod +x "$STUBS/$1"; }
# pm2 keeps "name<TAB>script" lines in PM2_STATE and logs every call.
stub pm2 'echo "pm2 $*" >> "$PM2_LOG"
case "$1" in
  describe) grep -q "^$2	" "$PM2_STATE" ;;
  delete) grep -v "^$2	" "$PM2_STATE" > "$PM2_STATE.tmp" || true; mv "$PM2_STATE.tmp" "$PM2_STATE" ;;
  start) script="$2"; shift 2; name=""; while [ $# -gt 0 ]; do [ "$1" = --name ] && name="$2"; shift; done
         printf "%s\t%s\n" "$name" "$script" >> "$PM2_STATE" ;;
  *) : ;;
esac'
stub curl '[ -f "$HEALTHY_FILE" ]'
stub aws 'printf "DATABASE_URL=postgresql://u:p@db/x\nCORS_ORIGINS=https://example.test\n"'
stub install 'args=(); while [ $# -gt 0 ]; do case "$1" in -o|-g|-m) shift 2 ;; -d) shift ;; *) args+=("$1"); shift ;; esac; done; mkdir -p "${args[@]}"'
stub chown ':'
stub runuser 'while [ "$1" != "--" ]; do shift; done; shift; exec "$@"'
export PATH="$STUBS:$PATH"

ROOT="$WORK/deploy"
release() { # stage an incoming api release with a stub prisma that "migrates"
  mkdir -p "$ROOT/incoming/$1/api/node_modules/.bin"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$ROOT/incoming/$1/api/node_modules/.bin/prisma"
  chmod +x "$ROOT/incoming/$1/api/node_modules/.bin/prisma"
}
activate() { bash "$SCRIPT" "$ROOT" "$1" secret-id ap-south-1 "$(id -un)" api; }
running() { cut -f2 "$PM2_STATE"; }

pass=0 fail=0
check() { if eval "$2"; then pass=$((pass + 1)); echo "  ok    $1"; else fail=$((fail + 1)); echo "  FAIL  $1"; fi; }

echo "a healthy first release"
release r1; touch "$HEALTHY_FILE"
activate r1 > "$WORK/out1" 2>&1 || true
check "r1 is running" 'running | grep -q "/releases/r1/api/start.sh"'
check "the API waits for in-flight payroll on stop (kill timeout >= 120s)" \
  'grep -E "pm2 start .*releases/r1/api/start.sh" "$PM2_LOG" | grep -Eq -- "--kill-timeout (1[2-9][0-9]{4}|[2-9][0-9]{5})"'

echo "a failed second release"
release r2; rm -f "$HEALTHY_FILE"
status=0; activate r2 > "$WORK/out2" 2>&1 || status=$?
check "the deploy reports failure" '[ "$status" -ne 0 ]'
check "r2 is not left running" '! running | grep -q "/releases/r2/"'
check "r1 is running again" 'running | grep -q "/releases/r1/api/start.sh"'

echo "a healthy third release"
release r3; touch "$HEALTHY_FILE"
activate r3 > "$WORK/out3" 2>&1 || true
check "r3 is the only API process" '[ "$(running | wc -l)" -eq 1 ] && running | grep -q "/releases/r3/"'

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
