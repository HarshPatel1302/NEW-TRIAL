#!/usr/bin/env bash
# Bypasses `cloudflared tunnel login` / cert.pem — use the token from the Cloudflare dashboard.
# Zero Trust → Networks → Tunnels → your tunnel → copy token from the cloudflared install command.
#
#   export TUNNEL_TOKEN='eyJhIjoi...'
#   export PATH="$HOME/.local/bin:$PATH"
#   ./scripts/cloudflare-tunnel/run-tunnel-with-dashboard-token.sh
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
if [[ -z "${TUNNEL_TOKEN:-}" ]]; then
  echo "Set TUNNEL_TOKEN from Zero Trust → Tunnels (cloudflared tunnel run --token …)."
  exit 1
fi
exec cloudflared tunnel --no-autoupdate run --token "${TUNNEL_TOKEN}"
