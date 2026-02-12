"""
Export receptionist v2 GLB from master blend.

Usage:
  blender -b avatar-pipeline/receptionist_master.blend --python avatar-pipeline/export_receptionist_v2.py

Optional env vars:
  RECEPTIONIST_OUTPUT_GLB
"""

import bpy
import os
import sys


EXPECTED_ACTIONS = {"idle", "waving", "talking", "pointing", "nodYes", "bow"}


def resolve_output_path():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(script_dir, ".."))
    return os.environ.get(
        "RECEPTIONIST_OUTPUT_GLB",
        os.path.join(
            repo_root,
            "receptionist-react",
            "public",
            "models",
            "receptionist",
            "receptionist_all_6_actions_v2.glb",
        ),
    )


def validate_actions():
    actions = {action.name for action in bpy.data.actions}
    missing = sorted(EXPECTED_ACTIONS - actions)
    if missing:
        raise RuntimeError(
            "Missing required action clip names for runtime compatibility: "
            + ", ".join(missing)
        )


def export_glb(output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_animations=True,
        export_nla_strips=True,
        export_morph=True,
        export_skins=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
    )
    print(f"[OK] Exported: {output_path}")


def main():
    output_path = resolve_output_path()
    print(f"Output: {output_path}")
    validate_actions()
    export_glb(output_path)
    print("[DONE] receptionist_all_6_actions_v2.glb generated.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)
