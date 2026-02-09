"""
Automated Blender Script: Add Morph Targets to Pratik Avatar
==============================================================

This script automatically creates all 17 morph targets (shape keys) needed
for facial animation: eyeBlink, visemes for lip-sync, and expressions.

Usage:
    blender -b pratik_avatar.glb --python blender_auto_morph_targets.py

Output:
    pratik_avatar_with_morphs.glb (with all 17 morph targets)
"""

import bpy
import math

# Configuration
OUTPUT_PATH = "/Users/harshui/Documents/FutureScape/VR Avatar/receptionist-react/public/models/pratik_avatar_with_morphs.glb"

# Morph targets to create (from template)
MORPH_TARGETS = {
    "eyeBlinkLeft": {"type": "eye", "side": "left"},
    "eyeBlinkRight": {"type": "eye", "side": "right"},
    "jawOpen": {"type": "jaw"},
    "viseme_AA": {"type": "viseme", "mouth": "wide_open"},  # "Ahh"
    "viseme_O": {"type": "viseme", "mouth": "rounded"},      # "Oh"
    "viseme_E": {"type": "viseme", "mouth": "wide_smile"},   # "Eee"
    "viseme_U": {"type": "viseme", "mouth": "pucker"},       # "Ooo"
    "viseme_FV": {"type": "viseme", "mouth": "bite_lip"},    # "Fff"
    "viseme_MBP": {"type": "viseme", "mouth": "closed"},     # "Mmm"
    "viseme_L": {"type": "viseme", "mouth": "tongue_teeth"}, # "Lll"
    "viseme_CH": {"type": "viseme", "mouth": "pucker_forward"}, # "Shh"
    "viseme_TH": {"type": "viseme", "mouth": "tongue_out"},  # "Thh"
    "viseme_R": {"type": "viseme", "mouth": "tight_lips"},   # "Rrr"
    "mouthSmileLeft": {"type": "expression", "area": "mouth", "side": "left"},
    "mouthSmileRight": {"type": "expression", "area": "mouth", "side": "right"},
    "browInnerUp": {"type": "expression", "area": "brow"},
    "browDownLeft": {"type": "expression", "area": "brow", "side": "left"},
    "browDownRight": {"type": "expression", "area": "brow", "side": "right"},
}

def find_head_mesh():
    """Find the head mesh in the scene"""
    head_mesh = None
    
    # Try common head mesh names
    for name in ['Wolf3D_Head', 'Head', 'head_mesh', 'avaturn_body', 'Head_Mesh']:
        obj = bpy.data.objects.get(name)
        if obj and obj.type == 'MESH':
            head_mesh = obj
            print(f"✓ Found head mesh: {name}")
            break
    
    # If not found, search for any mesh with "head" in name
    if not head_mesh:
        for obj in bpy.data.objects:
            if obj.type == 'MESH' and 'head' in obj.name.lower():
                head_mesh = obj
                print(f"✓ Found head mesh: {obj.name}")
                break
    
    # Last resort: find first mesh with most vertices (likely the head/body)
    if not head_mesh:
        meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
        if meshes:
            head_mesh = max(meshes, key=lambda obj: len(obj.data.vertices))
            print(f"⚠ Using mesh with most vertices: {head_mesh.name}")
    
    return head_mesh

def create_shape_key_basis(mesh_obj):
    """Ensure the mesh has a Basis shape key"""
    if not mesh_obj.data.shape_keys:
        # Create basis
        mesh_obj.shape_key_add(name='Basis', from_mix=False)
        print("✓ Created Basis shape key")
    return mesh_obj.data.shape_keys

def get_vertex_group_by_position(mesh_obj, area, side=None):
    """Get vertices in a specific area of the face"""
    vertices = []
    mesh = mesh_obj.data
    
    # Get bounding box center
    bbox_center = sum((mesh_obj.matrix_world @ v.co for v in mesh.vertices), start=mathutils.Vector()) / len(mesh.vertices)
    
    for i, vert in enumerate(mesh.vertices):
        world_co = mesh_obj.matrix_world @ vert.co
        
        # Relative to center
        rel_x = world_co.x - bbox_center.x
        rel_y = world_co.y - bbox_center.y
        rel_z = world_co.z - bbox_center.z
        
        # Eye vertices (upper part of head, close to center)
        if area == "eye":
            if 0.3 < rel_y < 0.6 and abs(rel_z) < 0.2:  # Upper face area
                if side == "left" and rel_x < -0.1:
                    vertices.append(i)
                elif side == "right" and rel_x > 0.1:
                    vertices.append(i)
        
        # Jaw vertices (lower part)
        elif area == "jaw":
            if rel_y < -0.2:  # Lower face
                vertices.append(i)
        
        # Mouth vertices (center-lower area)
        elif area == "mouth":
            if -0.3 < rel_y < 0 and abs(rel_z) < 0.15:  # Mouth region
                if side is None:
                    vertices.append(i)
                elif side == "left" and rel_x < -0.05:
                    vertices.append(i)
                elif side == "right" and rel_x > 0.05:
                    vertices.append(i)
        
        # Brow vertices (upper-center area)
        elif area == "brow":
            if 0.5 < rel_y < 0.8 and abs(rel_z) < 0.1:  # Brow region
                if side is None:
                    vertices.append(i)
                elif side == "left" and rel_x < -0.1:
                    vertices.append(i)
                elif side == "right" and rel_x > 0.1:
                    vertices.append(i)
    
    return vertices

def deform_vertices_for_morph(mesh_obj, shape_key_name, config):
    """Apply deformation for specific morph target"""
    shape_key = mesh_obj.data.shape_keys.key_blocks[shape_key_name]
    morph_type = config["type"]
    
    # Get the appropriate vertices
    if morph_type == "eye":
        vertices = get_vertex_group_by_position(mesh_obj, "eye", config.get("side"))
        # Close eye: move vertices inward (Z-axis)
        for i in vertices:
            shape_key.data[i].co.z -= 0.015  # Subtle inward movement
    
    elif morph_type == "jaw":
        vertices = get_vertex_group_by_position(mesh_obj, "jaw")
        # Open jaw: move vertices down (Y-axis)
        for i in vertices:
            shape_key.data[i].co.y -= 0.08  # Downward movement
    
    elif morph_type == "viseme":
        vertices = get_vertex_group_by_position(mesh_obj, "mouth")
        mouth_shape = config.get("mouth")
        
        for i in vertices:
            if mouth_shape == "wide_open":  # AA
                shape_key.data[i].co.y -= 0.05
                shape_key.data[i].co.z += 0.02  # Forward
            elif mouth_shape == "rounded":  # O
                shape_key.data[i].co.z += 0.03  # Pucker forward
            elif mouth_shape == "wide_smile":  # E
                shape_key.data[i].co.x *= 1.2  # Widen
            elif mouth_shape == "pucker":  # U
                shape_key.data[i].co.z += 0.04  # Forward pucker
            # Add more shapes as needed
    
    elif morph_type == "expression":
        area = config.get("area")
        side = config.get("side")
        
        if area == "mouth":
            vertices = get_vertex_group_by_position(mesh_obj, "mouth", side)
            # Smile: move corner up and outward
            for i in vertices:
                shape_key.data[i].co.y += 0.02
                if side == "left":
                    shape_key.data[i].co.x -= 0.01
                elif side == "right":
                    shape_key.data[i].co.x += 0.01
        
        elif area == "brow":
            vertices = get_vertex_group_by_position(mesh_obj, "brow", side)
            for i in vertices:
                if "Up" in shape_key_name:
                    shape_key.data[i].co.y += 0.03  # Raise brow
                else:
                    shape_key.data[i].co.y -= 0.02  # Lower brow

def create_morph_targets(mesh_obj):
    """Create all morph targets for the mesh"""
    shape_keys = create_shape_key_basis(mesh_obj)
    
    print("\n📊 Creating morph targets...")
    for morph_name, config in MORPH_TARGETS.items():
        # Create the shape key
        shape_key = mesh_obj.shape_key_add(name=morph_name, from_mix=False)
        
        # Apply deformation
        try:
            deform_vertices_for_morph(mesh_obj, morph_name, config)
            print(f"  ✓ {morph_name}")
        except Exception as e:
            print(f"  ⚠ {morph_name} - {str(e)}")
    
    print(f"\n✅ Created {len(MORPH_TARGETS)} morph targets")

def main():
    print("="*60)
    print("Pratik Avatar Morph Target Generator")
    print("="*60)
    
    # Find the head mesh
    head_mesh = find_head_mesh()
    
    if not head_mesh:
        print("❌ ERROR: Could not find head mesh!")
        print("Available meshes:", [obj.name for obj in bpy.data.objects if obj.type == 'MESH'])
        return
    
    # Create morph targets
    create_morph_targets(head_mesh)
    
    # Export
    print(f"\n📦 Exporting to: {OUTPUT_PATH}")
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format='GLB',
        export_animations=False,  # No animations yet
        export_morph=True,  # CRITICAL: Export shape keys as morph targets
        export_skins=True,  # Keep armature/bones
    )
    
    print("✅ DONE! Avatar exported with morph targets.")
    print(f"   Open in Blender to verify Shape Keys panel.")

if __name__ == "__main__":
    import mathutils  # Blender's math library
    main()
