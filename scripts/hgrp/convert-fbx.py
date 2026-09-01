"""Blender-headless FBX -> GLB conversion for HGRP character prefabs.

Usage (driven by convert.mjs):
  blender --background --python scripts/hgrp/convert-fbx.py -- <in.fbx> <out.glb>

Strips LOD1-3 and shadow-proxy meshes (the engine only consumes lod0) and exports
with tangents/skins/morph targets on, which the HGRP pipeline requires.
"""

import re
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
fbx_path, out_path = argv[0], argv[1]

STRIP_PATTERN = re.compile(r"(_lod[1-9]|_shadowProxy\w*)$", re.IGNORECASE)

bpy.ops.wm.read_factory_settings(use_empty=True)

# Blender 5.x ships the native FBX importer as wm.fbx_import; older builds use the addon.
if hasattr(bpy.ops.wm, "fbx_import"):
    bpy.ops.wm.fbx_import(filepath=fbx_path)
else:
    bpy.ops.import_scene.fbx(filepath=fbx_path)

stripped = []
for obj in list(bpy.data.objects):
    if obj.type == "MESH" and STRIP_PATTERN.search(obj.name):
        stripped.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
print(f"[convert] stripped {len(stripped)} lod/proxy meshes, kept {len(meshes)}")
for arm in armatures:
    print(f"[convert] armature '{arm.name}' bones={len(arm.data.bones)}")
for mesh in meshes:
    shape_keys = len(mesh.data.shape_keys.key_blocks) - 1 if mesh.data.shape_keys else 0
    materials = [slot.material.name if slot.material else "None" for slot in mesh.material_slots]
    print(
        f"[convert] keep {mesh.name}: verts={len(mesh.data.vertices)}"
        f" shapekeys={shape_keys} mats={materials}"
    )

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_tangents=True,
    export_skins=True,
    export_morph=True,
    export_morph_normal=True,
    export_yup=True,
)
print(f"[convert] exported {out_path}")
