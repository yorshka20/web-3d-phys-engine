import { AlphaMode, BaseMaterial } from '../types';
import {
  HGRP_SHADER_ID_BY_VARIANT,
  HGRPDroppedSubsystem,
  HGRPPermutation,
  hgrpPermutationShaderId,
  hgrpResolvePermutation,
} from './permutation';

// The HGRP (HypergryphRenderPipeline) material family reproduces the four CharacterNPR shader
// variants from ripped Unity material data. Parameter and texture-slot names mirror the HGRP
// property names verbatim so preset values load without translation.

export type HGRPShaderVariant =
  | 'CharacterNPR'
  | 'CharacterNPR_Skin'
  | 'CharacterNPR_Hair'
  | 'CharacterNPR_Eye'
  | 'CharacterNPR_VFX';

// The shader id vocabulary (base id per variant, permutation suffix) lives in permutation.ts.

// Shape of preset.json produced by scripts/hgrp/material-preset.mjs (schemaVersion 1).
export interface HGRPPresetMaterial {
  shader: string; // e.g. 'HGRP/CharacterNPR_Skin'
  textures: Record<string, string>; // HGRP slot name -> texture filename
  floats: Record<string, number>;
  ints: Record<string, number>;
  colors: Record<string, number[]>; // rgba tuples
}

// Per-character switches that decide whether an optional material layer is drawn at all.
// They belong to the character, not the scene: two characters in one frame can differ.
export interface HGRPCharacterFlags {
  // The game only renders the CharacterNPR_VFX layer once a character's max potential is
  // unlocked, so its materials load disabled unless this is set.
  maxPotential?: boolean;
}

// Which flag, if any, gates a variant. Single source for both the load-time decision and
// the calibration UI's toggle — a second copy of this mapping is how the two drift apart.
const OPTIONAL_LAYER_FLAG: Partial<Record<HGRPShaderVariant, keyof HGRPCharacterFlags>> = {
  CharacterNPR_VFX: 'maxPotential',
};

export function hgrpOptionalLayerFlag(
  variant: HGRPShaderVariant,
): keyof HGRPCharacterFlags | undefined {
  return OPTIONAL_LAYER_FLAG[variant];
}

export interface HGRPPreset {
  schemaVersion: number;
  character: string;
  materials: Record<string, HGRPPresetMaterial>;
}

// Unity BlendMode enum values that survive in the preset: 1 = One, 5 = SrcAlpha,
// 10 = OneMinusSrcAlpha. The engine's generic 'blend' alphaMode means straight alpha
// (SrcAlpha/OneMinusSrcAlpha); the effect shaders ask for One/OneMinusSrcAlpha, i.e.
// premultiplied, which darkens by an extra factor of alpha if rendered as straight.
export type HGRPBlendMode = 'straight' | 'premultiplied';

const UNITY_BLEND_ONE = 1;
const UNITY_BLEND_ONE_MINUS_SRC_ALPHA = 10;

export function hgrpBlendMode(floats: Record<string, number>): HGRPBlendMode {
  return floats._SrcBlend === UNITY_BLEND_ONE &&
    floats._DstBlend === UNITY_BLEND_ONE_MINUS_SRC_ALPHA
    ? 'premultiplied'
    : 'straight';
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

// Give a material the object frame its shading expects: the SDF face shadow wants the head.
// `jointNames` is the skin's joint list in palette order. A skin without the bone leaves the
// model frame in place — and says so, since a body-frame SDF shows a seam wherever the head
// turns.
export function hgrpResolveObjectFrame(
  material: HGRPMaterialDescriptor,
  jointNames: readonly string[],
): void {
  if (!material.permutation.enabled.includes('sdf')) {
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
  if (!isKnownVariant) {
    console.warn(
      `[hgrp] ${materialName}: shader "${preset.shader}" has no variant implementation, ` +
        'falling back to CharacterNPR — shading will be wrong for this material',
    );
  }
  const variant: HGRPShaderVariant = isKnownVariant
    ? (variantName as HGRPShaderVariant)
    : 'CharacterNPR';
  const gateFlag = hgrpOptionalLayerFlag(variant);

  // Unity material semantics: _SurfaceType 1 = transparent, _Cull 0 = two-sided (2 =
  // back-face culling). Cutout has TWO gates in HGRP: _AlphaClip and _EnableAlphaTest
  // (Pelica's cloth_01 uses only the latter — audited 2026-09-01, all-materials _AlphaClip
  // is 0). The glb's own alphaMode/doubleSided are export artifacts of the FBX->glTF
  // conversion — the preset is authoritative.
  const alphaMode: AlphaMode =
    floats._SurfaceType === 1
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
    blendMode: hgrpBlendMode(floats),
    eyeLayer: hgrpEyeLayer(variant, floats),
    permutation: { variant, enabled: [] },
    enabled: gateFlag === undefined || flags[gateFlag] === true,
  };
  hgrpRefreshPermutation(material);
  return material;
}

// glb materials with no preset entry: the shared eye-white/hair shadow overlay meshes, whose
// ripped material JSON does not exist. They are shadow overlay layers in-game, so the fill
// renders them as translucent dark shells (an opaque grey fill read as blank grey eyes /
// a grey cap); the real overlay formulas belong to the material-forensics session.
export function createDefaultHGRPMaterial(
  character: string,
  materialName: string,
): HGRPMaterialDescriptor {
  const material: HGRPMaterialDescriptor = {
    materialType: 'hgrp',
    customShaderId: HGRP_SHADER_ID_BY_VARIANT.CharacterNPR,
    materialKey: hgrpMaterialKey(character, materialName),
    materialName,
    variant: 'CharacterNPR',
    textures: {},
    // Explicit shadow params so the fill still shades instead of rendering unlit
    floats: { _ShadowColorBrightness: 0.5, _ShadowColorSaturation: 1 },
    // Near-transparent cool shadow: the shells' real material JSONs did not survive the rip
    // (common materials), and the eyeshadow shell covers the upper HALF of the eyeball — an
    // opaque guess reads as a black lid (falsified by the pink-shell test, 2026-09-01). It
    // is either a subtle lid-shadow layer or a blink eyelid meant to be hidden at rest;
    // both want it barely visible. GUI-calibrated guess.
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
