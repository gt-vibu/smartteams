#!/usr/bin/env bash
# Installs and starts PostgreSQL 17 (and, with --redis, Redis) directly on the CI runner.
#
# No containers: the project has no Docker dependency (docs/chore/TECHSTACK.v1.md — "No
# containerization"), and its database runs as a native service everywhere, CI included. This
# replaces the job-level `services:` containers the workflow used to start.
#
# Leaves a superuser `smarteam` (password `smarteam`, CI-only) owning a database `smarteam` on
# localhost:5432 — the same URL the suites and the drill were already written against.
#
#   bash scripts/ci/native-services.sh            # PostgreSQL only
#   bash scripts/ci/native-services.sh --redis    # PostgreSQL and Redis
set -euo pipefail

WITH_REDIS=false
[ "${1:-}" = "--redis" ] && WITH_REDIS=true

# PostgreSQL's own apt repository, so the server is 17 whatever the runner image ships.
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" |
  sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get update -qq
packages=(postgresql-17 postgresql-client-17)
$WITH_REDIS && packages+=(redis-server)
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "${packages[@]}"

# A runner image may already carry an older cluster holding port 5432, which would push the new
# one to 5433. Drop every other cluster, then pin 17 to 5432.
while read -r version name _; do
  if [ "$version" != "17" ]; then sudo pg_dropcluster --stop "$version" "$name"; fi
done < <(pg_lsclusters --no-header)
sudo pg_conftool 17 main set port 5432
sudo pg_ctlcluster 17 main restart

for _ in $(seq 1 30); do
  pg_isready -h localhost -p 5432 -q && break
  sleep 1
done
pg_isready -h localhost -p 5432

sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE smarteam LOGIN SUPERUSER PASSWORD 'smarteam';
CREATE DATABASE smarteam OWNER smarteam;
SQL
echo "PostgreSQL $(psql --version | awk '{print $3}') ready on localhost:5432"

if $WITH_REDIS; then
  sudo systemctl start redis-server
  for _ in $(seq 1 30); do
    [ "$(redis-cli -h localhost ping 2>/dev/null)" = "PONG" ] && break
    sleep 1
  done
  [ "$(redis-cli -h localhost ping)" = "PONG" ]
  echo "Redis $(redis-server --version | awk '{print $3}') ready on localhost:6379"
fi
