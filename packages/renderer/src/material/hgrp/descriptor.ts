import { AlphaMode, BaseMaterial, TransparentBlendMode } from '../types';
import {
  HGRP_SHADER_ID_BY_VARIANT,
  HGRPDroppedSubsystem,
  HGRPPermutation,
  hgrpPermutationShaderId,
  hgrpResolvePermutation,
} from './permutation';

// The HGRP (HypergryphRenderPipeline) material family reproduces the CharacterNPR shader
// variants from ripped Unity material data. Parameter and texture-slot names mirror the HGRP
// property names verbatim so preset values load without translation.

export type HGRPShaderVariant =
  | 'CharacterNPR'
  | 'CharacterNPR_Skin'
  | 'CharacterNPR_Hair'
  | 'CharacterNPR_Eye'
  | 'CharacterNPR_VFX'
  | 'CharacterNPR_OverlayShadow';

// The shader id vocabulary (base id per variant, permutation suffix) lives in permutation.ts.

// Shape of preset.json produced by scripts/hgrp/material-preset.mjs (schemaVersion 1).
export interface HGRPPresetMaterial {
  shader: string; // e.g. 'HGRP/CharacterNPR_Skin'
  textures: Record<string, string>; // HGRP slot name -> texture filename
  floats: Record<string, number>;
  ints: Record<string, number>;
  colors: Record<string, number[]>; // rgba tuples
  // The material object's own render state as the export carries it: the shader keywords the
  // game compiles in, its custom render queue, the passes it disables and its tag map. Carried
  // for the record — the engine derives the same facts from the gates and _SurfaceType.
  keywords?: string[];
  renderQueue?: number;
  disabledPasses?: string[];
  tags?: Record<string, string>;
}

// Per-character switches that decide whether an optional material layer is drawn at all.
// They belong to the character, not the scene: two characters in one frame can differ.
export interface HGRPCharacterFlags {
  // The game renders a character's max-potential effect (Laevatian's glow ring) only once
  // that potential is unlocked, so those materials load disabled unless this is set.
  maxPotential?: boolean;
}

// Which flag, if any, gates a material. The export carries no per-renderer state, and the
// effect shader (CharacterNPR_VFX) is also what a character's permanent energy parts use —
// jsspsi's wings and tail fin — so the variant cannot be the gate; the max-potential materials
// are the ones the game names `toppotential`. Single source for both the load-time decision
// and the calibration UI's toggle (HGRPMaterialDescriptor.gate).
export function hgrpOptionalLayerFlag(materialName: string): keyof HGRPCharacterFlags | undefined {
  return /toppotential/i.test(materialName) ? 'maxPotential' : undefined;
}

// The pipeline's own default material, which the export reports on the effect-overlay copies
// of a character's meshes (jsspsi's `vfxpart_*`: the horns, wings and fin duplicated for a
// runtime effect) — the game assigns their real material at run time, from data the export
// does not carry. Drawn as anything they would be a white film over the authored meshes.
const HGRP_PLACEHOLDER_SHADER = 'HGRP/Lit';

export interface HGRPPreset {
  schemaVersion: number;
  character: string;
  materials: Record<string, HGRPPresetMaterial>;
}

// Unity BlendMode enum values that survive in the preset: 1 = One, 5 = SrcAlpha,
// 10 = OneMinusSrcAlpha. The engine's generic 'blend' alphaMode means straight alpha
// (SrcAlpha/OneMinusSrcAlpha); the effect shaders ask for One/OneMinusSrcAlpha, i.e.
// premultiplied, which darkens by an extra factor of alpha if rendered as straight. The
// overlay-shadow shells (Blend Zero SrcColor) multiply; their material JSON did not survive
// the rip, so that mode is assigned by the default-fill factory, never derived from a preset.
export type HGRPBlendMode = TransparentBlendMode;

const UNITY_BLEND_ONE = 1;
const UNITY_BLEND_ONE_MINUS_SRC_ALPHA = 10;

export function hgrpBlendMode(floats: Record<string, number>): HGRPBlendMode {
  return floats._SrcBlend === UNITY_BLEND_ONE &&
    floats._DstBlend === UNITY_BLEND_ONE_MINUS_SRC_ALPHA
    ? 'premultiplied'
    : 'straight';
}

// The game's stencil choreography (hgrp-decompiled-formulas.md §5), transplanted from its
// depth prepass into the forward pass's opaque walk, which DrawListBuilder orders the same way.
// 'stamp': every opaque material's main draw writes its group, always, replacing — the eye
// materials _PreZStencilRefOption (52, "Draw Over Hair", carries bit 16; 36 is off), cloth,
// skin and the hair body 36 — so a surface in front of a brow takes its pixels back.
// 'hairYield': the hair strands inside the brow cut-out (_HairBrowMask, drawn by
// HGRPHairUnderBrowStage after the opaque walk with _HairStencilRef: 36 = "On", 52 turns the
// yield off) draw only where bit 16 is clear, so the brow shows through the bangs but never
// through the face, and never through hair the mask leaves white. 'gate': the overlay-shadow
// shells read the result — _ShadowOverIris 20 draws only over eye pixels (bits 16 + 4), 4 only
// over the rest of the character. 'none': the pass default (blend materials, the outline hulls
// of non-hair materials).
export type HGRPStencilRole = 'none' | 'stamp' | 'hairYield' | 'gate';

export const HGRP_STENCIL_EYE_BIT = 16;
export const HGRP_STENCIL_GATE_MASK = 20;
const HGRP_STENCIL_BODY_REF = 36;
const HGRP_STENCIL_SHELL_OVER_BODY = 4;

// Role of a material's main draw (the under-brow strands are a second draw, see
// hgrpHairYieldRef).
export function hgrpStencilRole(material: HGRPMaterialDescriptor): HGRPStencilRole {
  if (material.variant === 'CharacterNPR_OverlayShadow') {
    return 'gate';
  }
  return material.alphaMode === 'blend' ? 'none' : 'stamp';
}

// The stencil reference a material's main draw runs with, for its role above.
export function hgrpStencilRef(material: HGRPMaterialDescriptor): number {
  switch (hgrpStencilRole(material)) {
    case 'gate':
      return material.floats._ShadowOverIris ?? HGRP_STENCIL_SHELL_OVER_BODY;
    case 'stamp':
      return material.floats._PreZStencilRefOption ?? HGRP_STENCIL_BODY_REF;
    default:
      return 0;
  }
}

// The reference of the hair's under-brow draw ('hairYield'): with bit 16 clear (36) the test
// passes only where no eye stamp is; with 52 it always passes and the yield is off.
export function hgrpHairYieldRef(material: HGRPMaterialDescriptor): number {
  return material.floats._HairStencilRef ?? HGRP_STENCIL_BODY_REF;
}

// Which eye-region surface a CharacterNPR_Eye material is. The two share one shader in the
// game and the rip carries no explicit tag; the engine needs the distinction because the iris
// card sits behind the eye-white and is drawn through it (HGRPEyeOverlayStage) and shades
// unlit, while the brow is a regular opaque surface that shows through the bangs.
export type HGRPEyeLayer = 'iris' | 'brow';

// Derivation rule: the catchlight (_EyeHighLight) is the only Eye-variant feature that is
// definitionally an eyeball feature — a brow can legitimately carry a matcap, a shadow LUT or
// a ramp, so none of those is an identity. No render-state key separates the two either: both
// sit in the _PreZStencilRefOption 52 show-through group (_AlphaDstBlend differs, 0 vs 10, but
// its semantics did not survive the rip). Holds for both ripped characters (2026-09-02).
export function hgrpEyeLayer(
  variant: HGRPShaderVariant,
  floats: Record<string, number>,
): HGRPEyeLayer | undefined {
  if (variant !== 'CharacterNPR_Eye') {
    return undefined;
  }
  return floats._EyeHighLight === 1 ? 'iris' : 'brow';
}

export interface HGRPMaterialDescriptor extends BaseMaterial {
  materialType: 'hgrp';
  materialKey: string; // hgrp_<character>_<materialName>
  materialName: string; // glb material name == preset key (the join key)
  variant: HGRPShaderVariant;
  textures: Record<string, string>; // HGRP slot name -> registered texture assetId
  floats: Record<string, number>; // HGRP float params, names verbatim
  colors: Record<string, [number, number, number, number]>;
  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
  blendMode: HGRPBlendMode;
  // Resolved once at load (hgrpEyeLayer); the draw lists and the shader read this role, never
  // a feature flag or a texture's presence, to tell the iris from the brow.
  eyeLayer?: HGRPEyeLayer;
  // The static subsystems this material enables (permutation.ts). customShaderId is its
  // serialization; both are written together by hgrpRefreshPermutation and nowhere else, so
  // the draw lists, the binder and the pipeline key never disagree about what is on.
  permutation: HGRPPermutation;
  // False keeps the material out of the draw lists entirely (see HGRPCharacterFlags). The
  // draw list reads this boolean and nothing else — it must never test a character or
  // material name to decide what to draw.
  enabled: boolean;
  // The character flag that switches this material, resolved at load (hgrpOptionalLayerFlag);
  // undefined for a material that is always drawn.
  gate?: keyof HGRPCharacterFlags;
  // Skin-joint index (palette order) whose posed frame is this material's object space, or
  // undefined for the model's own frame. The face shader reads the light and the camera in
  // object space (SDF mirror and yaw, highlight offset; formulas §2), and in the game that
  // space is the face renderer's root bone — Unity's unity_ObjectToWorld of a skinned mesh is
  // its root bone's matrix — so the SDF turns with the head. Resolved at load by
  // hgrpResolveObjectFrame; the shader composes the model matrix with that joint's palette
  // entry (lighting/hgrp_npr.wgsl hgrp_object_to_world).
  objectFrameJoint?: number;
}

// The head bone every ripped character carries (Biped naming; the face sub-joints hang under
// it), which is the object frame of the materials that shade through the SDF face shadow.
export const HGRP_OBJECT_FRAME_JOINT = 'Bip001_Head';

// Give a material the object frame its shading expects: the SDF face shadow wants the head,
// and so do hair — its strands run along the object-space up and its lobes fade with the
// object-space view direction (formulas §3) — and the eye, whose ramp reads the light flattened
// to the object's horizontal plane (§4); hair and eye meshes hang under the head bone.
// `jointNames` is the skin's joint list in palette order. A skin without the bone leaves the
// model frame in place — and says so, since a body-frame SDF shows a seam wherever the head
// turns.
export function hgrpResolveObjectFrame(
  material: HGRPMaterialDescriptor,
  jointNames: readonly string[],
): void {
  const wantsHead =
    material.permutation.enabled.includes('sdf') ||
    material.variant === 'CharacterNPR_Hair' ||
    material.variant === 'CharacterNPR_Eye';
  if (!wantsHead) {
    return;
  }
  const joint = jointNames.indexOf(HGRP_OBJECT_FRAME_JOINT);
  if (joint < 0) {
    console.warn(
      `[hgrp] ${material.materialName}: skin has no ${HGRP_OBJECT_FRAME_JOINT} joint, the SDF ` +
        'face shadow stays in the model frame',
    );
    return;
  }
  material.objectFrameJoint = joint;
}

export function hgrpTextureAssetId(character: string, filename: string): string {
  return `hgrp_${character}_${filename}`;
}

export function hgrpMaterialKey(character: string, materialName: string): string {
  return `hgrp_${character}_${materialName}`;
}

// A gate on without its texture leaves the subsystem off (permutation.ts); said out loud, since
// the alternative — shading with a placeholder texture — looks like a correct render.
function warnDroppedSubsystems(materialName: string, dropped: HGRPDroppedSubsystem[]): void {
  if (dropped.length === 0) {
    return;
  }
  const detail = dropped
    .map((entry) => `${entry.subsystem} (${entry.gate} on, no ${entry.missing.join('/')})`)
    .join(', ');
  console.warn(`[hgrp] ${materialName}: gates on without their textures, left off: ${detail}`);
}

// Re-resolve the permutation from the descriptor's current floats and textures. The load-time
// factories call it once; the calibration GUI calls it after flipping a static gate, which
// then resolves to another permutation — a new shader module and pipeline on first draw.
export function hgrpRefreshPermutation(material: HGRPMaterialDescriptor): void {
  const { permutation, dropped } = hgrpResolvePermutation(
    material.variant,
    material.floats,
    material.textures,
  );
  material.permutation = permutation;
  material.customShaderId = hgrpPermutationShaderId(permutation);
  warnDroppedSubsystems(material.materialName, dropped);
}

export function createHGRPMaterialFromPreset(
  character: string,
  materialName: string,
  preset: HGRPPresetMaterial,
  flags: HGRPCharacterFlags = {},
): HGRPMaterialDescriptor {
  const floats = preset.floats;

  const textures: Record<string, string> = {};
  for (const [slot, filename] of Object.entries(preset.textures)) {
    textures[slot] = hgrpTextureAssetId(character, filename);
  }

  const colors: Record<string, [number, number, number, number]> = {};
  for (const [name, rgba] of Object.entries(preset.colors)) {
    colors[name] = [rgba[0] ?? 1, rgba[1] ?? 1, rgba[2] ?? 1, rgba[3] ?? 1];
  }

  // An unimplemented HGRP variant (Laevatian carries HGRP/CharacterNPR_VFX) still renders,
  // through the generic CharacterNPR model — with the wrong shading and none of its own
  // parameter vocabulary. Silence would make that indistinguishable from a correct render,
  // which is the same failure mode as a missing texture quietly resolving to white.
  const variantName = preset.shader.split('/').pop();
  const isKnownVariant = !!variantName && variantName in HGRP_SHADER_ID_BY_VARIANT;
  const placeholder = preset.shader === HGRP_PLACEHOLDER_SHADER;
  if (placeholder) {
    console.log(
      `[hgrp] ${materialName}: the pipeline default material (${preset.shader}) — an effect part ` +
        'whose material the game assigns at run time; not drawn',
    );
  } else if (!isKnownVariant) {
    console.warn(
      `[hgrp] ${materialName}: shader "${preset.shader}" has no variant implementation, ` +
        'falling back to CharacterNPR — shading will be wrong for this material',
    );
  }
  const variant: HGRPShaderVariant = isKnownVariant
    ? (variantName as HGRPShaderVariant)
    : 'CharacterNPR';
  const gateFlag = hgrpOptionalLayerFlag(materialName);

  // Unity material semantics: _SurfaceType 1 = transparent, _Cull 0 = two-sided (2 =
  // back-face culling). Cutout has TWO gates in HGRP: _AlphaClip and _EnableAlphaTest
  // (Pelica's cloth_01 uses only the latter — audited 2026-09-01, all-materials _AlphaClip
  // is 0). The glb's own alphaMode/doubleSided are export artifacts of the FBX->glTF
  // conversion — the preset is authoritative. The overlay-shadow shells are the exception:
  // their shader fixes Blend Zero SrcColor and the transparent queue itself, so a shell
  // material carries neither _SurfaceType nor blend factors.
  const overlayShadow = variant === 'CharacterNPR_OverlayShadow';
  const alphaMode: AlphaMode = overlayShadow
    ? 'blend'
    : floats._SurfaceType === 1
      ? 'blend'
      : floats._AlphaClip === 1 || floats._EnableAlphaTest === 1
        ? 'mask'
        : 'opaque';

  const material: HGRPMaterialDescriptor = {
    materialType: 'hgrp',
    customShaderId: HGRP_SHADER_ID_BY_VARIANT[variant],
    materialKey: hgrpMaterialKey(character, materialName),
    materialName,
    variant,
    textures,
    floats: { ...floats, ...preset.ints },
    colors,
    alphaMode,
    alphaCutoff: floats._AlphaClipThreshold ?? 0.5,
    doubleSided: floats._Cull === 0,
    blendMode: overlayShadow ? 'multiply' : hgrpBlendMode(floats),
    eyeLayer: hgrpEyeLayer(variant, floats),
    permutation: { variant, enabled: [] },
    enabled: !placeholder && (gateFlag === undefined || flags[gateFlag] === true),
    gate: gateFlag,
  };
  hgrpRefreshPermutation(material);
  return material;
}

// The shared shadow shells every character's glb carries under these material names, for a
// preset that lacks them (the first rip exported no common materials; the 2026-09 export
// carries them, and a preset entry always wins): what the game's OverlayShadow shader would
// read for them. The masks are the two 32x32 vertical R-gradients that ship in
// every character's texture folder (param ledger, "新证据"); the stencil gate is the shader's
// _ShadowOverIris enum — 20 = only over the iris and brow, 4 = only over the rest of the
// character. _BaseColor is the one value the rip does not carry: a muted cool-grey shadow
// tint, calibrated in the GUI (guess ledger G9) — an sRGB picker value like every stored
// color, decoded at pack time (linear 0.6 / 0.55 / 0.62).
interface HGRPCommonShell {
  mask: string;
  shadowOverIris: 4 | 20;
  baseColor: [number, number, number, number];
}

export const HGRP_COMMON_SHELLS: Readonly<Record<string, HGRPCommonShell>> = {
  M_eyewhiteshadow_common_01: {
    mask: 'T_actor_common_eyeshadow_01_M.png',
    shadowOverIris: 20,
    baseColor: [0.797, 0.766, 0.809, 1],
  },
  M_hairshadow_common_01: {
    mask: 'T_actor_common_hairshadow_01_M.png',
    shadowOverIris: 4,
    baseColor: [0.797, 0.766, 0.809, 1],
  },
};

// glb materials with no preset entry. The known shadow shells become OverlayShadow materials —
// unlit multiply layers reading their gradient mask as density (materials/HGRPOverlayShadow.wgsl)
// — when the character's texture folder has the mask (`hasTexture` answers by filename); any
// other unmatched material gets a translucent dark CharacterNPR fill, so the gap shows instead
// of rendering as an opaque grey slab.
export function createDefaultHGRPMaterial(
  character: string,
  materialName: string,
  hasTexture: (filename: string) => boolean = () => false,
): HGRPMaterialDescriptor {
  const shell = HGRP_COMMON_SHELLS[materialName];
  const material: HGRPMaterialDescriptor =
    shell && hasTexture(shell.mask)
      ? {
          materialType: 'hgrp',
          customShaderId: HGRP_SHADER_ID_BY_VARIANT.CharacterNPR_OverlayShadow,
          materialKey: hgrpMaterialKey(character, materialName),
          materialName,
          variant: 'CharacterNPR_OverlayShadow',
          textures: { _BaseMap: hgrpTextureAssetId(character, shell.mask) },
          // Gray-as-alpha: the masks carry their gradient in R alone (G = B = A = 1)
          floats: { _UseGrayAsAlpha: 1, _ShadowOverIris: shell.shadowOverIris },
          colors: { _BaseColor: [...shell.baseColor] },
          alphaMode: 'blend',
          alphaCutoff: 0.5,
          doubleSided: false,
          blendMode: 'multiply',
          permutation: { variant: 'CharacterNPR_OverlayShadow', enabled: [] },
          enabled: true,
        }
      : {
          materialType: 'hgrp',
          customShaderId: HGRP_SHADER_ID_BY_VARIANT.CharacterNPR,
          materialKey: hgrpMaterialKey(character, materialName),
          materialName,
          variant: 'CharacterNPR',
          textures: {},
          // Explicit shadow params so the fill still shades instead of rendering unlit
          floats: { _ShadowColorBrightness: 0.5, _ShadowColorSaturation: 1 },
          colors: { _BaseColor: [0.12, 0.15, 0.25, 0.15] },
          alphaMode: 'blend',
          alphaCutoff: 0.5,
          doubleSided: false,
          blendMode: 'straight',
          permutation: { variant: 'CharacterNPR', enabled: [] },
          enabled: true,
        };
  hgrpRefreshPermutation(material);
  return material;
}
