# Renderer Frame Contract: Identity Keys & Draw Ordering

Core design of the ecs → renderer frame interface (`@renderer/frame/types` `RenderData`),
established 2026-08-31. Read this before touching the extract paths in `WebGPURenderSystem`,
the draw loop in `WebGPURenderer`, or any GPU-resource cache keyed off `RenderData`.

## The identity-key trio

Every `RenderData` carries three **required** identity keys. Each names one independent
dimension of render state; every GPU-resource cache is keyed by exactly one of them. They are
deliberately separate — the original design used `geometryId` for everything, which both
corrupted multi-mesh models (shared geometry cache entries) and blocked per-node transforms
(shared MVP buffers).

| Key | Identifies | Sharing rule | Keys these caches |
| --- | --- | --- | --- |
| `geometryId` | Geometry **data** | Same vertex/index data ⇒ same key, across entities and node instances | `GeometryManager.createGeometryFromData` (vertex/index `GPUBuffer`s) |
| `uniformKey` | **Draw instance** (transform slot) | Unique per world matrix per frame; renderables with *identical* matrices may share it | `MVPUniformManager` MVP uniform buffer + bind group |
| `materialKey` | **Material** | Same source material ⇒ same key (glTF materials are document-level, shared across primitives) | Material uniform buffers, texture/material bind groups |

Key formats by extract path (`WebGPURenderSystem`):

- glTF: `geometryId = gltf_{assetId}_m{mesh}_p{prim}`, `uniformKey = gltf_{entityId}_i{instance}`,
  `materialKey = gltf_{assetId}_mat_{index}` (stamped on `GLTFMaterial` by the loader, which
  dedupes document materials; a primitive without a material falls back to the entity's
  component material under `gltf_mat_fallback_{entityId}`).
- mesh: `geometryId` per entity (geometry params may differ per entity),
  `uniformKey = mesh_{entityId}`, `materialKey = bindGroupId || uniformBufferId || mesh_mat_{entityId}`.
- PMX: `geometryId` per entity+material, `uniformKey = pmx_{entityId}` (all material draws of an
  entity share one matrix), `materialKey = pmx_{assetId}_mat_{index}`.

## The two invariants that force this design

1. **`@SmartResource(cache: true)` caches by its first argument (the label) alone** — later
   arguments never enter the key. A cache hit returns the previously created resource even if
   the data differs. Therefore: a label must be unique iff the underlying data is unique.
2. **Every `queue.writeBuffer` issued while encoding lands before the frame's submit.** Two
   draws sharing one uniform buffer but writing different values is last-write-wins for *both*
   draws. Therefore: a uniform slot must be unique per distinct matrix set per frame — and
   conversely, equal `uniformKey` guarantees equal matrices, so redundant writes/binds are
   skipped safely.

## Draw ordering: sorted flat lists, no grouping

`WebGPURenderer` encodes from flat, ordered draw lists (no grouping structure; groups exist
only as runs of equal keys in the sorted order — future GPU instancing consumes exactly those
runs). Ordering is the first-class contract because transparency and `renderOrder` require a
*global* order, which any state-axis grouping structurally breaks.

```
build:   partition by alphaMode — blend → transparent, opaque/mask → opaque
opaque:  sort by renderOrder → pipelineKey (semantic cache key) → materialKey → geometryId
transp.: sort by renderOrder → view-space depth, back to front (correctness over state dedup)
prepare: async — resolve pipelines (once per pipelineKey), geometry, material bind groups
         (once per materialKey per frame), PMX animation buffers (once per asset per frame)
encode:  fully synchronous state-cached walk over opaque then transparent, one pass encoder;
         a bind is re-issued only when its identity key changes; drawIndexed per item
```

Bind-slot semantics by material family (group 0 = time, group 1 = MVP, always):
regular = group 2 textures + group 3 material; glTF = group 2 PBR material+textures;
PMX = group 2 material + group 3 animation.

Known deferred items: alpha MASK shader discard is unverified; PMX animation buffers are keyed
per asset (two entities sharing one PMX asset would fight); uniforms are rewritten every frame
(no dirty tracking).
