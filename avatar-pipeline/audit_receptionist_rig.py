"""
Audit receptionist avatar rig and create a canonical master .blend.

Usage:
  blender -b --python avatar-pipeline/audit_receptionist_rig.py

Optional env vars:
  RECEPTIONIST_MODEL_IN
  RECEPTIONIST_MASTER_BLEND
"""

import bpy
import os
import sys


EXPECTED_MESHES = {
    "Head_Mesh",
    "Eye_Mesh",
    "EyeAO_Mesh",
    "Eyelash_Mesh",
    "Teeth_Mesh",
    "Tongue_Mesh",
}

EXPECTED_ACTIONS = {"idle", "waving", "talking", "pointing", "nodYes", "bow"}


def resolve_paths():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(script_dir, ".."))
    model_in = os.environ.get(
        "RECEPTIONIST_MODEL_IN",
        os.path.join(
            repo_root,
            "receptionist-react",
            "public",
            "models",
            "receptionist",
            "receptionist_all_6_actions.glb",
        ),
    )
    master_blend = os.environ.get(
        "RECEPTIONIST_MASTER_BLEND",
        os.path.join(script_dir, "receptionist_master.blend"),
    )
    return model_in, master_blend


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(path):
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    bpy.ops.import_scene.gltf(filepath=path)


def validate_scene():
    mesh_names = {obj.name for obj in bpy.data.objects if obj.type == "MESH"}
    action_names = {action.name for action in bpy.data.actions}

    missing_meshes = sorted(EXPECTED_MESHES - mesh_names)
    missing_actions = sorted(EXPECTED_ACTIONS - action_names)

    print("\n=== Rig Audit ===")
    print(f"Meshes found: {len(mesh_names)}")
    print(f"Actions found: {sorted(action_names)}")

    if missing_meshes:
        print(f"[WARN] Missing expected meshes: {missing_meshes}")
    else:
        print("[OK] All expected facial meshes present")

    if missing_actions:
        print(f"[WARN] Missing expected actions: {missing_actions}")
    else:
        print("[OK] All expected action clip names present")

    return missing_meshes, missing_actions


def save_master(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print(f"[OK] Saved master blend: {path}")


def main():
    model_in, master_blend = resolve_paths()
    print(f"Input model: {model_in}")
    print(f"Master blend output: {master_blend}")

    reset_scene()
    import_model(model_in)
    missing_meshes, missing_actions = validate_scene()
    save_master(master_blend)

    if missing_meshes or missing_actions:
        print("[DONE WITH WARNINGS] Rig audit completed with missing expected items.")
    else:
        print("[DONE] Rig audit completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)
