"""Blender-headless FBX -> GLB conversion for HGRP character prefabs.

Usage (driven by convert.mjs):
  blender --background --python scripts/hgrp/convert-fbx.py -- <in.fbx> <out.glb>

Reads the FBX as metres whatever its header claims, strips LOD1-3 and shadow-proxy meshes
(the engine only consumes lod0), bakes the position-averaged normal every kept mesh needs
for the inverted-hull outline into its COLOR_0, records which of the source's UV sets each
mesh carries, and exports with tangents/skins/morph targets on, which the HGRP pipeline
requires.
"""

import re
import struct
import sys
import zlib
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

# The export names a mesh's UV layers after the Unity channel they came from — UV0, UV1, UV2 —
# and a mesh carries only the channels it has, so the layer list has gaps (most meshes are
# UV0 + UV2). Blender keeps the layers in that order and the glTF exporter numbers them
# TEXCOORD_0, TEXCOORD_1, ... by position, which would hand the engine UV2's data as
# TEXCOORD_1, the set the HGRP shaders read the fur layer and the VFX mask from. The channel
# indices are written on the mesh (glTF mesh extras) so convert.mjs can put each set back at
# TEXCOORD_<channel>.
UV_SETS_PROPERTY = "hgrpUvSets"


def record_uv_sets(mesh):
    channels = []
    for layer in mesh.uv_layers:
        match = re.fullmatch(r"UV(\d+)", layer.name)
        if not match:
            raise ValueError(f"{mesh.name}: UV layer {layer.name!r} is not named after a Unity channel")
        channels.append(int(match.group(1)))
    mesh[UV_SETS_PROPERTY] = channels
    return channels

# The game's characters are authored in metres (a body stands 1.5-1.8 units tall, Bip001
# sits at 0.95), and that is the unit the engine's HGRP length constants assume. The FBX
# header's UnitScaleFactor is not a reliable statement of that: the first rip declared 100
# (one unit = 100 cm, correct), the 2026-09 export declares 1 (one unit = 1 cm) over the same
# metre-scale geometry, and every Blender importer honours the declaration — the model came
# out one hundredth its size, root node scaled 0.01, fur shells "0.26 µm" apart. So the unit is
# read here and cancelled: one FBX unit is one metre, always.
def read_fbx_unit_scale(path):
    """UnitScaleFactor of a binary FBX's GlobalSettings, or None when the file has none."""
    with open(path, "rb") as handle:
        data = handle.read()
    if not data.startswith(b"Kaydara FBX Binary"):
        return None
    version = struct.unpack_from("<I", data, 23)[0]
    wide = version >= 7500
    head = struct.Struct("<QQQB" if wide else "<IIIB")

    def read_property(pos):
        kind = chr(data[pos])
        pos += 1
        if kind in "YCIFDL":
            size = {"Y": 2, "C": 1, "I": 4, "F": 4, "D": 8, "L": 8}[kind]
            value = struct.unpack_from({"Y": "<h", "C": "<?", "I": "<i", "F": "<f", "D": "<d", "L": "<q"}[kind], data, pos)[0]
            return value, pos + size
        if kind in "SR":
            length = struct.unpack_from("<I", data, pos)[0]
            raw = data[pos + 4 : pos + 4 + length]
            return (raw.decode("utf8", "replace") if kind == "S" else raw), pos + 4 + length
        if kind in "fdlib":
            count, encoding, byte_length = struct.unpack_from("<III", data, pos)
            return None, pos + 12 + byte_length
        raise ValueError(f"unknown FBX property type {kind!r}")

    def read_node(pos):
        end, prop_count, _prop_bytes, name_length = head.unpack_from(data, pos)
        pos += head.size
        if end == 0:
            return None, None, None, pos
        name = data[pos : pos + name_length].decode("ascii", "replace")
        pos += name_length
        props = []
        for _ in range(prop_count):
            value, pos = read_property(pos)
            props.append(value)
        return name, props, pos, end

    pos = 27
    while pos < len(data):
        name, props, body, end = read_node(pos)
        if name is None:
            break
        if name == "GlobalSettings":
            pos = body
            while pos < end:
                child, _, child_body, child_end = read_node(pos)
                if child is None:
                    break
                if child == "Properties70":
                    pos = child_body
                    while pos < child_end:
                        prop, values, _, prop_end = read_node(pos)
                        if prop is None:
                            break
                        if prop == "P" and values and values[0] == "UnitScaleFactor":
                            return float(values[-1])
                        pos = prop_end
                pos = child_end
            return None
        pos = end
    return None


argv = sys.argv[sys.argv.index("--") + 1 :]
fbx_path, out_path = argv[0], argv[1]

STRIP_PATTERN = re.compile(r"(_lod[1-9]|_shadowProxy\w*)$", re.IGNORECASE)

bpy.ops.wm.read_factory_settings(use_empty=True)

unit_scale = read_fbx_unit_scale(fbx_path)
# Both importers scale the scene by UnitScaleFactor / 100 (centimetres to Blender metres);
# 100 / UnitScaleFactor on top of that leaves one FBX unit as one metre.
global_scale = 100.0 / unit_scale if unit_scale else 1.0
print(
    f"[convert] fbx UnitScaleFactor={unit_scale} -> global_scale {global_scale:g}"
    " (one FBX unit read as one metre)"
)
# Blender 5.x ships the native FBX importer as wm.fbx_import; older builds use the addon.
if hasattr(bpy.ops.wm, "fbx_import"):
    bpy.ops.wm.fbx_import(filepath=fbx_path, global_scale=global_scale)
else:
    bpy.ops.import_scene.fbx(filepath=fbx_path, global_scale=1.0, apply_unit_scale=False)

stripped = []
for obj in list(bpy.data.objects):
    if obj.type == "MESH" and STRIP_PATTERN.search(obj.name):
        stripped.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
print(f"[convert] stripped {len(stripped)} lod/proxy meshes, kept {len(meshes)}")
for arm in armatures:
    world_scale = tuple(round(v, 4) for v in arm.matrix_world.to_scale())
    print(f"[convert] armature '{arm.name}' bones={len(arm.data.bones)} worldScale={world_scale}")
for mesh in meshes:
    shape_keys = len(mesh.data.shape_keys.key_blocks) - 1 if mesh.data.shape_keys else 0
    materials = [slot.material.name if slot.material else "None" for slot in mesh.material_slots]
    bake_smooth_normals(mesh.data)
    uv_sets = record_uv_sets(mesh.data)
    print(
        f"[convert] keep {mesh.name}: verts={len(mesh.data.vertices)}"
        f" shapekeys={shape_keys} mats={materials} smoothNormals=COLOR_0 uvSets={uv_sets}"
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
    # Mesh custom properties (the UV channel record) travel as glTF extras
    export_extras=True,
)
print(f"[convert] exported {out_path}")
