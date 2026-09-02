"""Blender-headless FBX -> GLB conversion for HGRP character prefabs.

Usage (driven by convert.mjs):
  blender --background --python scripts/hgrp/convert-fbx.py -- <in.fbx> <out.glb>

Strips LOD1-3 and shadow-proxy meshes (the engine only consumes lod0), bakes the
position-averaged normal every kept mesh needs for the inverted-hull outline into its
COLOR_0, and exports with tangents/skins/morph targets on, which the HGRP pipeline requires.
"""

import re
import sys
from collections import defaultdict

import bpy
from mathutils import Vector

# HGRP outlines extrude along _OutlineAverageNormal: the normal averaged over every vertex
# that shares a position, so the hull stays closed across hard edges and UV seams where the
# shading normals are split. The FBX carries only the split normals; bake the average into a
# point-domain color attribute (xyz * 0.5 + 0.5) that exports as COLOR_0 — the engine's
# vertex layout already carries a color slot, and no HGRP material reads vertex color.
#
# Only normals facing the same way take part (dot > SAME_SIDE_MIN_DOT): a hard edge up to
# about 100 degrees still averages, but the two faces of a double-sided card (hair, cloth
# flaps) do not cancel each other into a sideways or zero vector.
#
# The glTF exporter converts positions and normals from Blender's Z-up to glTF's Y-up
# (x, y, z) -> (x, z, -y) but leaves color attributes untouched, so the baked vector is
# written in glTF axes (verified against the exported NORMAL, 2026-09-02).
SMOOTH_NORMAL_ATTRIBUTE = "SmoothNormal"
POSITION_KEY_SCALE = 1e5  # positions closer than 1e-5 (object units) count as shared
SAME_SIDE_MIN_DOT = -0.2


def bake_smooth_normals(mesh):
    corner_normals = mesh.corner_normals
    by_position = defaultdict(list)
    for loop in mesh.loops:
        co = mesh.vertices[loop.vertex_index].co
        key = tuple(round(c * POSITION_KEY_SCALE) for c in co)
        by_position[key].append(corner_normals[loop.index].vector.copy())
    attribute = mesh.color_attributes.get(SMOOTH_NORMAL_ATTRIBUTE) or mesh.color_attributes.new(
        SMOOTH_NORMAL_ATTRIBUTE, "FLOAT_COLOR", "POINT"
    )
    for vertex in mesh.vertices:
        key = tuple(round(c * POSITION_KEY_SCALE) for c in vertex.co)
        own = vertex.normal
        n = Vector((0.0, 0.0, 0.0))
        for candidate in by_position[key]:
            if candidate.dot(own) > SAME_SIDE_MIN_DOT:
                n += candidate
        n = n.normalized() if n.length_squared > 0.0 else own
        gltf = (n.x, n.z, -n.y)
        attribute.data[vertex.index].color = (
            gltf[0] * 0.5 + 0.5,
            gltf[1] * 0.5 + 0.5,
            gltf[2] * 0.5 + 0.5,
            1.0,
        )
    mesh.color_attributes.active_color = attribute
    mesh.color_attributes.render_color_index = mesh.color_attributes.find(SMOOTH_NORMAL_ATTRIBUTE)

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
    bake_smooth_normals(mesh.data)
    print(
        f"[convert] keep {mesh.name}: verts={len(mesh.data.vertices)}"
        f" shapekeys={shape_keys} mats={materials} smoothNormals=COLOR_0"
    )

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_tangents=True,
    export_skins=True,
    export_morph=True,
    export_morph_normal=True,
    export_yup=True,
    # The baked smooth normal is the active color attribute; export exactly that one,
    # whether or not the material references vertex color.
    export_vertex_color="ACTIVE",
    export_all_vertex_colors=False,
    export_active_vertex_color_when_no_material=True,
)
print(f"[convert] exported {out_path}")
