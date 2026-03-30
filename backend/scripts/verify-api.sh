#!/usr/bin/env bash
# Smoke-test the receptionist API. Loads PORT and BACKEND_API_KEY from backend/.env when present.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-5050}"
BASE="http://127.0.0.1:${PORT}"
KEY="${BACKEND_API_KEY:-}"

echo "==> GET ${BASE}/api/health (no key)"
curl -sS -f "${BASE}/api/health" | head -c 200 && echo "" || {
  echo "FAIL: health"
  exit 1
}

echo "==> GET ${BASE}/api/health/ready (no key)"
curl -sS -f "${BASE}/api/health/ready" | head -c 200 && echo "" || {
  echo "FAIL: health/ready"
  exit 1
}

if [[ -z "$KEY" ]]; then
  echo "BACKEND_API_KEY not set in .env — skipping authenticated routes."
  exit 0
fi

echo "==> GET ${BASE}/api/visitors?limit=1 (x-api-key)"
curl -sS -f -H "x-api-key: ${KEY}" "${BASE}/api/visitors?limit=1" | head -c 200 && echo "" || {
  echo "FAIL: visitors"
  exit 1
}

echo "==> POST ${BASE}/api/sessions/start"
SESSION_JSON=$(curl -sS -f -H "x-api-key: ${KEY}" -H "Content-Type: application/json" \
  -H "x-kiosk-id: verify-script" \
  -d '{"kioskId":"verify-script"}' \
  "${BASE}/api/sessions/start")
echo "$SESSION_JSON" | head -c 300 && echo ""

SID=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.session && j.session.id ? j.session.id : '')" "$SESSION_JSON")
if [[ -z "$SID" ]]; then
  echo "FAIL: could not parse session id"
  exit 1
fi

echo "==> POST ${BASE}/api/sessions/${SID}/events"
curl -sS -f -H "x-api-key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"role":"tool","eventType":"verify:ping","content":"ok"}' \
  "${BASE}/api/sessions/${SID}/events" | head -c 200 && echo "" || {
  echo "FAIL: events"
  exit 1
}

echo "==> POST ${BASE}/api/sessions/${SID}/end"
curl -sS -f -H "x-api-key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"status":"completed","summary":"verify-api script"}' \
  "${BASE}/api/sessions/${SID}/end" | head -c 200 && echo "" || {
  echo "FAIL: end"
  exit 1
}

echo "==> GET ${BASE}/api/analytics/summary?days=7"
curl -sS -f -H "x-api-key: ${KEY}" "${BASE}/api/analytics/summary?days=7" | head -c 200 && echo "" || {
  echo "FAIL: analytics"
  exit 1
}

echo "OK — all checks passed."
