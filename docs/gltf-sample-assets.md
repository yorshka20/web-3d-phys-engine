# glTF Sample Assets × Renderer Capability Map

Surveyed 2026-08-31 by scanning every `Models/*/glTF/*.gltf` in the `packages/gltf-samples`
submodule (pinned commit `2bac6f8c`, ~180 models). Purpose: know which sample models test which
renderer feature, and what must be implemented for each hero asset to render correctly.

Target visuals for any model: the Khronos reference viewer,
<https://github.khronos.org/glTF-Sample-Viewer-Release/>.

## What the pipeline consumes today (2026-08-31)

`AssetLoader.convertGLTFPrimitiveToGeometry` + `gltf_material_shader`:

- **Attributes**: POSITION, NORMAL, TEXCOORD_0/1, COLOR_0, JOINTS_0, WEIGHTS_0, TANGENT, packed
  into a fixed 26-float vertex; missing attributes get defaults (normal `(0,1,0)`, uv `0`,
  color white). Attribute arrays are assumed float32 (quantized/normalized attrs unsupported).
- **Indices**: uint16 only — uint32 accessors are silently corrupted by `new Uint16Array(...)`
  truncation (AssetLoader), and the uint16 assumption repeats in `GeometryData`,
  `GeometryManager`, `GPUResourceCoordinator` (2-byte alignment logic), and
  `WebGPURenderer.renderTick` (`setIndexBuffer(buffer, 'uint16')`). Non-indexed primitives get
  synthesized sequential indices (fixed 2026-08-31; Fox was invisible before).
- **Materials**: metal-rough factors + baseColor / metallicRoughness / normal / occlusion /
  emissive textures, alphaMode, doubleSided, per glTF material. The glTF material always wins:
  the ecs `WebGPU3DRenderComponent` material scalars are inert for `materialType: 'gltf'`
  (only `materialType`/`customShaderId` enter the pipeline key).
- **NOT consumed**: node transforms & scene hierarchy, skins, morph targets, animations,
  cameras, punctual lights, and every KHR/EXT extension.

## Core-spec gaps

Ordered by number of sample models blocked. "Test models" are the smallest/clearest cases.

| Gap | Models hit | Test models | Notes |
| --- | ---: | --- | --- |
| Node transforms & hierarchy | 118 | Duck (0.01 scale matrix), DamagedHelmet (rotation), ABeautifulGame (48 transformed nodes) | The biggest gap. `stages/gltf.ts` currently works around it with hand-measured per-entity scales. Fix direction: bake node world transforms into vertex data at load, or emit one renderable per node. |
| uint32 indices | 28 | **SciFiHelmet** (70,074 verts, single mesh, otherwise extension-free — the designated regression model), ToyCar, ABeautifulGame | Silent corruption, not an error. Fix = plumb `indexFormat` through GeometryData → GPUResourceCoordinator → `setIndexBuffer`. |
| Animations (node TRS / weights) | 26 | AnimatedTriangle, BoxAnimated, InterpolationTest | |
| Alpha MASK | 16 | AlphaBlendModeTest, Sponza (foliage/chains) | alphaMode already reaches the pipeline key; whether the shader discards is unverified. |
| Alpha BLEND (sorting) | 13 | AlphaBlendModeTest | Needs back-to-front draw ordering; renderer currently has no sort. |
| Mesh instancing (1 mesh, N nodes) | 13 | ABeautifulGame (chess pieces), CesiumMilkTruck (wheels) | Depends on node-hierarchy support; `InstanceManager` is an empty class today. |
| Skinning | 7 | SimpleSkin, RiggedSimple, Fox, CesiumMan, BrainStem | Skinned models render in bind pose today (acceptable fallback). |
| Morph targets | 4 | SimpleMorph, AnimatedMorphCube | Related to the dormant PMX morph-compute path. |
| Quantized/normalized attributes | 3 | MeshoptCubeTest (REQ KHR_mesh_quantization), RecursiveSkeletons | Converter assumes float arrays. |
| Non-triangle primitive modes | 2 | MeshPrimitiveModes | Low value; ecs mesh path already supports line-list separately. |
| Sparse accessors | 1 | SimpleSparseAccessor | gltf-transform may expand these at read time — verify before writing code. |

## Material/feature extensions

`REQ` = model declares `extensionsRequired` (unrenderable without it); `opt` = used but
optional (renders, looks wrong/different). Counts across the library.

| Extension | REQ | opt | Test models | Worth it? |
| --- | ---: | ---: | --- | --- |
| KHR_materials_transmission | 2 | 31 | TransmissionTest, CompareTransmission; FlightHelmet visor, ToyCar windows | High — most-used extension; glass everywhere. Needs framebuffer refraction pass. |
| KHR_materials_volume | 1 | 24 | AttenuationTest, DragonAttenuation | Pairs with transmission. |
| KHR_materials_ior | 0 | 17 | IORTestGrid | Cheap once specular BRDF exists. |
| KHR_materials_clearcoat | 1 | 12 | ClearCoatTest, ClearCoatCarPaint | |
| KHR_materials_iridescence | 0 | 10 | IridescenceMetallicSpheres | |
| KHR_materials_sheen | 2 | 8 | SheenTestGrid, SheenChair | |
| KHR_texture_transform | 7 | 8 | TextureTransformTest, ToyCar | Cheap (UV matrix in shader), unblocks many furniture-class models. |
| KHR_materials_specular | 2 | 7 | SpecularTest | |
| KHR_materials_anisotropy | 0 | 7 | AnisotropyStrengthTest, CarbonFibre | |
| KHR_materials_variants | 0 | 7 | MaterialsVariantsShoe | Asset-selection feature, not shading. |
| KHR_lights_punctual | 6 | 5 | DirectionalLight, LightsPunctualLamp | Scene lights from the asset; renderer lighting is its own topic. |
| KHR_materials_emissive_strength | 1 | 4 | EmissiveStrengthTest | Trivial (multiplier). |
| KHR_materials_dispersion | 0 | 4 | DispersionTest | Late-game. |
| KHR_materials_unlit | 3 | 2 | UnlitTest | Trivial (skip lighting). |
| KHR_materials_pbrSpecularGlossiness | 1 | 0 | SpecGlossVsMetalRough | Legacy, deliberately skip. |

## Hero assets: requirement checklists

What each showcase model needs before it matches the reference viewer.

| Hero | Size | Needs (core) | Needs (extensions) | Status today |
| --- | --- | --- | --- | --- |
| **FlightHelmet** | 95k tris, 15 imgs, 46MB | nothing — flat hierarchy, uint16, opaque | transmission (visor only) | **Renders correctly now** (visor opaque). In the gltf stage. |
| **DamagedHelmet** | 15k tris, 5 imgs, 3MB | node transform (one rotation node) | — | In the stage; orientation may differ from reference until node transforms land. |
| **SciFiHelmet** | 23k tris, 4K textures, 28MB | **uint32 indices** | — | Excluded from the stage; add back as the uint32 regression model. |
| **Sponza** | 262k tris, 69 imgs, 50MB | alpha MASK (foliage), uint16 ✓, 1 transformed node | — | Surprisingly close: mostly core-compatible. Best candidate for a dedicated lighting stage. |
| **ToyCar** | 213k tris | uint32 indices, node transforms | texture_transform, transmission, sheen, clearcoat | Geometry corrupt today. |
| **ABeautifulGame** | 574k tris, 33 imgs | uint32 indices, node hierarchy + instancing | transmission, volume | The end-boss showcase. |

## Suggested implementation order

1. **Node transforms** — unlocks 118 models and deletes the hand-measured scales in
   `stages/gltf.ts`; prerequisite for instancing/skinning/animation.
2. **uint32 indices** — mechanical fix across the five uint16 sites; regression model
   SciFiHelmet, then ToyCar/ABeautifulGame geometry.
3. **Alpha MASK verify + BLEND sorting** — unlocks Sponza as a lighting testbed.
4. **Lighting quality (IBL + tonemapping)** — not a glTF feature, but it is most of the visual
   gap the current scene shows ("粗糙" is mainly the lighting model, not model fidelity).
5. **Skinning + animation**, sharing bone infrastructure with the stalled PMX work.
6. Extensions by leverage: emissive_strength/unlit (trivial) → texture_transform →
   transmission+volume+ior → clearcoat/sheen/specular → iridescence/anisotropy/dispersion.
