#!/usr/bin/env bash
# MealMate server installer / updater — run on the droplet as root:
#   cd ~/mealmate/server && sudo bash install.sh
# First run: asks for your domain, household code and Spoonacular key, then sets up
# the service, nginx and HTTPS. Later runs: updates the code and keeps your settings and data.
set -euo pipefail

APP_DIR=/opt/mealmate
SERVICE=mealmate
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=3100

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mXX %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root (sudo bash install.sh)"

# ---- Node.js
command -v node >/dev/null || die "Node.js is not installed. Install Node 20: https://github.com/nodesource/distributions"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]')
if [ "$NODE_MAJOR" -lt 18 ] || { [ "$NODE_MAJOR" -eq 18 ] && [ "$NODE_MINOR" -lt 17 ]; }; then
  die "Node $(node -v) is too old; MealMate needs 18.17 or newer."
fi
NODE_BIN=$(command -v node)
say "Using Node $(node -v) at $NODE_BIN"

# ---- user + files
id -u mealmate >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin mealmate
mkdir -p "$APP_DIR/data"
install -m 644 "$SRC_DIR/server.js" "$SRC_DIR/package.json" "$APP_DIR/"
chown -R mealmate:mealmate "$APP_DIR/data"

FIRST_RUN=1
[ -f "$APP_DIR/.env" ] && FIRST_RUN=0

if [ "$FIRST_RUN" -eq 1 ]; then
  say "First-time setup"
  read -rp "Domain for the MealMate server [mealmate.screaminge.co.uk]: " DOMAIN
  DOMAIN=${DOMAIN:-mealmate.screaminge.co.uk}
  read -rp "Address the app is served from [https://paulhessle-cyber.github.io]: " ORIGIN
  ORIGIN=${ORIGIN:-https://paulhessle-cyber.github.io}
  ORIGIN=${ORIGIN%/}
  while :; do
    read -rsp "Choose a household code (at least 6 characters, you'll type it once on each phone): " CODE; echo
    [ ${#CODE} -ge 6 ] || { warn "Too short"; continue; }
    read -rsp "Type it again: " CODE2; echo
    [ "$CODE" = "$CODE2" ] && break || warn "They didn't match"
  done
  read -rsp "Paste your Spoonacular API key (Enter to skip and use TheMealDB only): " SPOON; echo
  umask 077
  cat > "$APP_DIR/.env" <<EOF
MEALMATE_CODE=$CODE
SPOONACULAR_API_KEY=$SPOON
ALLOWED_ORIGINS=$ORIGIN
PORT=$PORT
DOMAIN=$DOMAIN
EOF
  umask 022
else
  say "Updating existing install (settings and data kept)"
  DOMAIN=$(grep -E '^DOMAIN=' "$APP_DIR/.env" | cut -d= -f2- || true)
  PORT=$(grep -E '^PORT=' "$APP_DIR/.env" | cut -d= -f2- || echo 3100)
fi
chown root:mealmate "$APP_DIR/.env"; chmod 640 "$APP_DIR/.env"

# ---- systemd
cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=MealMate server
After=network-online.target
Wants=network-online.target

[Service]
User=mealmate
Group=mealmate
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  say "Service is running: $(curl -fsS http://127.0.0.1:$PORT/api/health)"
else
  journalctl -u "$SERVICE" -n 30 --no-pager
  die "The service didn't start — see the log above."
fi

[ "$FIRST_RUN" -eq 1 ] || { say "Update done."; exit 0; }

# ---- nginx + HTTPS (first run only)
if ! command -v nginx >/dev/null; then
  say "Installing nginx"
  apt-get update -qq && apt-get install -y -qq nginx
fi
cat > /etc/nginx/sites-available/mealmate <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    client_max_body_size 3m;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/mealmate /etc/nginx/sites-enabled/mealmate
nginx -t && systemctl reload nginx

say "Checking DNS for $DOMAIN"
MY_IP=$(curl -fsS -4 https://api.ipify.org || true)
DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [ -z "$DNS_IP" ] || [ "$DNS_IP" != "$MY_IP" ]; then
  warn "$DOMAIN points to '${DNS_IP:-nothing}', but this droplet is $MY_IP."
  warn "Add an A record: $DOMAIN -> $MY_IP, wait a few minutes, then run:"
  warn "  certbot --nginx -d $DOMAIN --redirect"
  exit 0
fi

if ! command -v certbot >/dev/null; then
  say "Installing certbot"
  apt-get install -y -qq certbot python3-certbot-nginx
fi
read -rp "Email for HTTPS certificate expiry notices: " EMAIL
certbot --nginx -d "$DOMAIN" --redirect --agree-tos -m "$EMAIL" --non-interactive
say "All done. Test it: https://$DOMAIN/api/health"
