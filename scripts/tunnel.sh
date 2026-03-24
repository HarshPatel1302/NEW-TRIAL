#!/bin/bash
# Cloudflare Tunnel - exposes localhost:3000 via https://xxx.trycloudflare.com
# Prerequisites: Backend on :5000, Frontend on :3000 with proxy to backend
# For API to work remotely, set REACT_APP_RECEPTIONIST_API_URL=/api in .env.local

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLOUDFLARED="$ROOT/cloudflared"

if [ -x "$CLOUDFLARED" ]; then
  exec "$CLOUDFLARED" tunnel --url http://localhost:3000
elif command -v cloudflared &>/dev/null; then
  exec cloudflared tunnel --url http://localhost:3000
else
  echo "cloudflared not found. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
  exit 1
fi
