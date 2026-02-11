#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MASTER_BLEND="${SCRIPT_DIR}/receptionist_master.blend"
OUTPUT_GLB="${REPO_ROOT}/receptionist-react/public/models/receptionist/receptionist_all_6_actions_v2.glb"

if ! command -v blender >/dev/null 2>&1; then
  echo "Blender is not installed or not on PATH."
  exit 1
fi

echo "[1/3] Auditing rig and generating master blend..."
blender -b --python "${SCRIPT_DIR}/audit_receptionist_rig.py"

echo "[2/3] Exporting v2 GLB..."
blender -b "${MASTER_BLEND}" --python "${SCRIPT_DIR}/export_receptionist_v2.py"

echo "[3/3] Validating v2 GLB contract..."
node "${SCRIPT_DIR}/validate_receptionist_glb.mjs" "${OUTPUT_GLB}"

echo "Done: ${OUTPUT_GLB}"
