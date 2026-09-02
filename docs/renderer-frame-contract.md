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

A fourth key, `skinKey`, is **optional** and follows the same rule: it identifies the *skin
instance* (one posed skeleton) and keys the joint-palette storage buffer in
`MVPUniformManager`, so every primitive of a skinned character shares one upload per frame.
It is set together with `boneMatrices`; a renderable without it binds the shared
single-identity palette, which makes the default vertex attributes (joint 0, weight 1) skin to
a no-op. Because the palette lives in the MVP bind group, that group's cache key is
`uniformKey|skinKey`, not `uniformKey` alone.

Key formats by extract path (`WebGPURenderSystem`):

- glTF: `geometryId = gltf_{assetId}_m{mesh}_p{prim}`, `uniformKey = gltf_{entityId}_i{instance}`,
  `materialKey = gltf_{assetId}_mat_{index}` (stamped on `GLTFMaterial` by the loader, which
  dedupes document materials; a primitive without a material falls back to the entity's
  component material under `gltf_mat_fallback_{entityId}`).
- HGRP (glTF carrier, materials joined from a character preset by glb material name):
  geometry/uniform keys as glTF; `materialKey = hgrp_{character}_{materialName}` (stamped on
  `HGRPMaterialDescriptor` by the loader's material resolver).
- mesh: `geometryId` per entity (geometry params may differ per entity),
  `uniformKey = mesh_{entityId}`, `materialKey = bindGroupId || uniformBufferId || mesh_mat_{entityId}`.
- PMX: `geometryId` per entity+material, `uniformKey = pmx_{entityId}` (all material draws of an
  entity share one matrix), `materialKey = pmx_{assetId}_mat_{index}`.
- Skinned glTF/HGRP: `skinKey = gltf_{entityId}_s{skinIndex}` (PMX drives its bones through its
  own group-3 animation bind group and sets no `skinKey`).

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
HGRP = group 2 material+textures+shared samplers (uniform fields and texture slots declared
once in `material/hgrpContract.ts`; `HGRPMaterialLayout.ts` derives the byte layout, binding
numbers and the generated WGSL fragments that PipelineManager, MaterialBinder and the shaders
all consume);
PMX = group 2 material + group 3 animation.

Known deferred items: alpha MASK shader discard is unverified; PMX animation buffers are keyed
per asset (two entities sharing one PMX asset would fight); uniforms are rewritten every frame
(no dirty tracking).

## Module structure (who owns what)

- `webGPU/renderer/frame/DrawListBuilder.ts` — pure data step: builds, partitions, and sorts
  the frame's `DrawItem` lists. No GPU access, no DI; unit-testable in isolation.
- `webGPU/renderer/passes/ForwardPass.ts` — the forward shading pass (geometry and lighting
  computed in one pass writing to the HDR scene-color target + depth, as opposed to a
  deferred G-buffer chain). A render pass is the unit that resolves and draws its own draw
  lists into an encoder, so it owns all three steps: attachment descriptors, the async prepare
  phase, and the synchronous encode walk. The walk is deliberately NOT a separate "executor"
  object — machinery is extracted for sharing only when another draw-list pass (shadow /
  depth-prepass / outline) actually needs it. PMX-specific resolution (per-material geometry,
  animation buffers) lives as pass privates under the same rule. Passes are renderer-private
  objects wired by constructor, not DI services; attachment views are injected as closures
  (the swapchain texture changes per frame, depth on resize).
- `webGPU/renderer/passes/DepthPrepass.ts` — depth-only prepass of the HGRP character into a
  sampleable depth texture (format authority `WebGPUContext.getPrepassDepthFormat`), bound to
  every HGRP pipeline as group 3 (per-frame globals) and read by the screen-space depth rim.
  The forward pass still writes its own depth attachment.
- `webGPU/renderer/passes/BloomPass.ts` — linear-light HDR bloom over the scene-color
  target: threshold prefilter into a half-resolution rgba16float mip chain, downsample walk,
  additive tent upsample; mip 0 accumulates the glow the tonemap composites.
- `webGPU/renderer/passes/TonemapPass.ts` — composites bloom onto the HDR scene color
  (rgba16float, format authority `WebGPUContext.getSceneColorFormat`), applies exposure ×
  ACES and a manual sRGB encode, writing an encoded-LDR rgba8unorm texture for FXAA. A fixed
  post-process pass with exactly one pipeline, so it builds its shader module and pipeline
  directly instead of going through the material-pipeline machinery (ShaderManager
  registration and semantic pipeline keys are material-shader concerns). Material pipelines
  consequently declare the scene-color format as their color target, not the swapchain
  format.
- `webGPU/renderer/passes/FXAAPass.ts` — final anti-aliasing over the encoded LDR output,
  written to the swapchain's plain view (values are already sRGB-encoded; a second encode
  would wash the image).
- `webGPU/core/MaterialBinder.ts` — `@Injectable` DI service resolving material-tier bind
  groups by `materialKey` (regular + glTF + HGRP families; PMX material bind groups come
  pre-built from `PMXMaterialProcessor`).
- `WebGPURenderer` — device/context lifecycle, manager construction, frame loop
  (`beginFrame`/`renderTick`/`endFrame`), and pass sequencing: the dormant PMX morph compute
  pass (commented out), then `DepthPrepass → ForwardPass(HDR) → BloomPass → TonemapPass(LDR)
  → FXAAPass(swapchain)`. Future passes join as sibling objects under `passes/` in this
  schedule.
