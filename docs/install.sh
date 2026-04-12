#!/usr/bin/env bash
#
# Gitbacker installer — self-hosted git backup tool
#
#   curl -fsSL https://gitbacker.com/install.sh | bash
#
# What this does:
#   1. Checks for Docker and Docker Compose
#   2. Creates ~/gitbacker with docker-compose.yml and .env
#   3. Generates a random JWT secret
#   4. Pulls images and starts all services
#   5. Seeds the admin account
#   6. Prints the URL to access Gitbacker
#
set -euo pipefail

REPO="https://raw.githubusercontent.com/gitbckr/gitbacker/main"
INSTALL_DIR="${GITBACKER_DIR:-$HOME/gitbacker}"
VERSION="${GITBACKER_VERSION:-latest}"

# --- Helpers ---

info()  { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
ok()    { printf "\033[1;32m==>\033[0m %s\n" "$*"; }
warn()  { printf "\033[1;33m==>\033[0m %s\n" "$*"; }
fail()  { printf "\033[1;31m==>\033[0m %s\n" "$*" >&2; exit 1; }

check_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required but not installed. See https://docs.docker.com/get-docker/"
}

random_secret() {
  head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 43
}

wait_for_healthy() {
  local url="$1" retries="${2:-30}" delay="${3:-2}"
  info "Waiting for API to be ready..."
  for i in $(seq 1 "$retries"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done
  fail "API did not become healthy after $((retries * delay))s"
}

# --- Preflight checks ---

info "Checking prerequisites..."
check_command docker
docker compose version >/dev/null 2>&1 || fail "Docker Compose V2 is required (docker compose, not docker-compose)"
check_command curl
ok "Docker and Docker Compose found"

# --- Install directory ---

if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
  warn "Existing installation found at $INSTALL_DIR"
  warn "Pulling latest images and restarting..."
  cd "$INSTALL_DIR"
  VERSION="$VERSION" docker compose pull
  VERSION="$VERSION" docker compose up -d
  ok "Gitbacker updated and running at http://localhost:3000"
  exit 0
fi

info "Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# --- Download files ---

info "Downloading configuration..."
curl -fsSL "$REPO/docker-compose.yml" -o docker-compose.yml
curl -fsSL "$REPO/.env.example" -o .env

# --- Configure ---

JWT_SECRET=$(random_secret)
ADMIN_PASSWORD=$(random_secret | head -c 16)

sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
rm -f .env.bak

cat > .admin-credentials <<CREDS
Gitbacker Admin Credentials
============================
URL:      http://localhost:3000
Email:    admin@gitbacker.local
Password: $ADMIN_PASSWORD

Store this securely and delete this file.
CREDS
chmod 600 .admin-credentials

ok "Generated JWT secret and admin credentials"

# --- Start ---

info "Pulling images (this may take a minute)..."
VERSION="$VERSION" docker compose pull --quiet

info "Starting Gitbacker..."
VERSION="$VERSION" docker compose up -d

# --- Seed admin ---

wait_for_healthy "http://localhost:8000/api/health"

info "Creating admin account..."
docker compose exec -e ADMIN_PASSWORD="$ADMIN_PASSWORD" api python seed_admin.py

ok "Gitbacker is running!"
echo ""
echo "  Open:     http://localhost:3000"
echo "  Email:    admin@gitbacker.local"
echo "  Password: $ADMIN_PASSWORD"
echo ""
echo "  Credentials saved to: $INSTALL_DIR/.admin-credentials"
echo ""
echo "  To stop:    cd $INSTALL_DIR && docker compose down"
echo "  To update:  curl -fsSL https://gitbacker.com/install.sh | bash"
echo ""
