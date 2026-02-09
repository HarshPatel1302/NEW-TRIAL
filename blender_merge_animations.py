"""
Mixamo FBX Animation Merger
============================

This script imports all Mixamo animations and merges them with Pratik avatar.

Usage:
    blender -b pratik_avatar_with_morphs.glb --python blender_merge_animations.py

Output:
    pratik_final.glb (with morph targets + 6 Mixamo animations)
"""

import bpy
import os

# Configuration
MIXAMO_DIR = "/Users/harshui/Downloads"
OUTPUT_PATH = "/Users/harshui/Documents/FutureScape/VR Avatar/receptionist-react/public/models/pratik_final.glb"

# Animation files and their target names
ANIMATIONS = {
    "Breathing Idle.fbx": "Idle",
    "Waving (1).fbx": "Wave",
    "Talking (1).fbx": "Talking",
    "Head Nod Yes (1).fbx": "Nod",
    "Pointing (1).fbx": "Point",
    "Quick Formal Bow (1).fbx": "Bow",
}

def find_armature():
    """Find the main avatar armature"""
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            print(f"✓ Found armature: {obj.name}")
            return obj
    return None

def remove_mixamorig_prefix():
    """Remove 'mixamorig:' prefix from all bones in current armature"""
    armature = bpy.context.object
    if armature and armature.type == 'ARMATURE':
        renamed_count = 0
        for bone in armature.data.bones:
            if bone.name.startswith("mixamorig:"):
                old_name = bone.name
                bone.name = bone.name[10:]  # Remove first 10 chars
                print(f"  Renamed: {old_name} → {bone.name}")
                renamed_count += 1
        print(f"✓ Renamed {renamed_count} bones")
    return renamed_count

def import_and_apply_animation(fbx_path, action_name, target_armature):
    """Import FBX animation and apply to target armature"""
    print(f"\n📥 Importing {action_name}...")
    
    # Import the FBX
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    
    # Find the newly imported armature (last in list)
    imported_armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    if len(imported_armatures) < 2:
        print(f"  ⚠ No animation armature found")
        return False
    
    anim_armature = imported_armatures[-1]  # Last imported
    bpy.context.view_layer.objects.active = anim_armature
    
    # Remove mixamorig: prefix from imported bones
    remove_mixamorig_prefix()
    
    # Get the animation data
    if anim_armature.animation_data and anim_armature.animation_data.action:
        original_action = anim_armature.animation_data.action
        
        # Rename the action
        original_action.name = action_name
        
        # Make it a fake user so it doesn't get deleted
        original_action.use_fake_user = True
        
        print(f"  ✓ Action renamed to: {action_name}")
        
        # Apply to target armature
        if not target_armature.animation_data:
            target_armature.animation_data_create()
        
        # Push down to NLA track (this preserves it in the file)
        bpy.context.view_layer.objects.active = target_armature
        target_armature.animation_data.action = original_action
        
        # Create NLA track
        nla_track = target_armature.animation_data.nla_tracks.new()
        nla_track.name = action_name
        nla_track.strips.new(action_name, start=1, action=original_action)
        
        print(f"  ✓ Applied to target armature")
    else:
        print(f"  ⚠ No animation data found")
    
    # Delete the imported objects (we only needed the action)
    bpy.ops.object.select_all(action='DESELECT')
    anim_armature.select_set(True)
    bpy.ops.object.delete()
    
    return True

def main():
    print("="*60)
    print("Mixamo Animation Merger for Pratik")
    print("="*60)
    
    # Find Pratik's armature
    target_armature = find_armature()
    if not target_armature:
        print("❌ ERROR: No armature found!")
        return
    
    # Make sure target armature bones don't have mixamorig: prefix
    print("\n🔧 Checking target armature bone names...")
    bpy.context.view_layer.objects.active = target_armature
    remove_mixamorig_prefix()
    
    # Import each animation
    success_count = 0
    for fbx_file, action_name in ANIMATIONS.items():
        fbx_path = os.path.join(MIXAMO_DIR, fbx_file)
        
        if not os.path.exists(fbx_path):
            print(f"⚠ File not found: {fbx_file}")
            continue
        
        if import_and_apply_animation(fbx_path, action_name, target_armature):
            success_count += 1
    
    print(f"\n✅ Successfully imported {success_count}/{len(ANIMATIONS)} animations")
    
    # List all actions
    print("\n📋 Available actions:")
    for action in bpy.data.actions:
        print(f"  - {action.name}")
    
    # Export final GLB
    print(f"\n📦 Exporting to: {OUTPUT_PATH}")
    
    # Select all objects for export
    bpy.ops.object.select_all(action='SELECT')
    
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format='GLB',
        export_animations=True,  # Include all animations
        export_morph=True,       # Keep morph targets
        export_skins=True,       # Keep armature
        export_nla_strips=True,  # Export NLA tracks as separate animations
    )
    
    print("✅ DONE! Final avatar exported.")
    print(f"   - {success_count} Mixamo animations")
    print(f"   - All morph targets preserved")

if __name__ == "__main__":
    main()
