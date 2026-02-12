"""
Add Morph Targets to Breathing.glb Avatar
==========================================
"""

import bpy
import os

# Configuration
INPUT_PATH = "/Users/harshui/Documents/FutureScape/VR Avatar/receptionist-react/public/models/receptionist/breathing.glb"
OUTPUT_PATH = "/Users/harshui/Documents/FutureScape/VR Avatar/receptionist-react/public/models/receptionist/breathing_with_morphs.glb"

# Morph targets
MORPH_TARGETS = {
    "eyeBlinkLeft": {"type": "eye", "side": "left"},
    "eyeBlinkRight": {"type": "eye", "side": "right"},
    "jawOpen": {"type": "jaw"},
    "viseme_AA": {"type": "viseme"},
    "viseme_O": {"type": "viseme"},
    "viseme_E": {"type": "viseme"},
    "viseme_U": {"type": "viseme"},
    "viseme_FV": {"type": "viseme"},
    "viseme_MBP": {"type": "viseme"},
    "viseme_L": {"type": "viseme"},
    "viseme_CH": {"type": "viseme"},
    "viseme_TH": {"type": "viseme"},
    "viseme_R": {"type": "viseme"},
    "mouthSmileLeft": {"type": "expression", "area": "mouth", "side": "left"},
    "mouthSmileRight": {"type": "expression", "area": "mouth", "side": "right"},
    "browInnerUp": {"type": "expression", "area": "brow"},
    "browDownLeft": {"type": "expression", "area": "brow", "side": "left"},
    "browDownRight": {"type": "expression", "area": "brow", "side": "right"},
}

def main():
    print("="*60)
    print("Adding Morph Targets to Breathing.glb")
    print("="*60)
    
    # Clear default scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    
    # Import the GLB
    print(f"\n📥 Importing: {INPUT_PATH}")
    bpy.ops.import_scene.gltf(filepath=INPUT_PATH)
    
    # Find mesh
    head_mesh = None
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            head_mesh = obj
            print(f"✓ Found mesh: {obj.name} ({len(obj.data.vertices)} vertices)")
            break
    
    if not head_mesh:
        print("❌ No mesh found!")
        return
    
    # Create basis shape key
    if not head_mesh.data.shape_keys:
        head_mesh.shape_key_add(name='Basis', from_mix=False)
        print("✓ Created Basis shape key")
    
    # Create morph targets
    print(f"\n📊 Creating {len(MORPH_TARGETS)} morph targets...")
    for morph_name in MORPH_TARGETS.keys():
        shape_key = head_mesh.shape_key_add(name=morph_name, from_mix=False)
        print(f"  ✓ {morph_name}")
    
    print(f"\n✅ Created {len(MORPH_TARGETS)} morph targets")
    print("⚠️  NOTE: These are placeholder morphs (no deformation yet)")
    print("    You can manually sculpt them in Blender GUI")
    
    # Export
    print(f"\n📦 Exporting to: {OUTPUT_PATH}")
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format='GLB',
        export_animations=True,
        export_morph=True,
        export_skins=True,
    )
    
    file_size = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"✅ DONE! breathing_with_morphs.glb created ({file_size:.1f} MB)")
    print(f"\nNext: Update your React code to load this file as base avatar")

if __name__ == "__main__":
    main()
