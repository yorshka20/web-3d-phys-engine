import type { HGRPShaderVariant } from './descriptor';

// A SUBSYSTEM is one feature of the HGRP shading model: a master switch, the texture slots it
// consumes, an optional WGSL hook and (through the field tables in params.ts, which tag every
// field with a subsystem id) its numeric parameters. Pure data; permutation.ts resolves a
// material's enabled set from it and wgsl.ts composes the shader from it. Design record:
// learnings shader-feature-gating.md.

export type HGRPSubsystemId =
  | 'surface'
  | 'base'
  | 'ramp'
  | 'shadow'
  | 'shadowLut'
  | 'normal'
  | 'sdf'
  | 'rim'
  | 'spec'
  | 'metallicGloss'
  | 'emission'
  | 'outline'
  | 'hairBand'
  | 'hairLines'
  | 'hairSplitNormal'
  | 'skinHighlight'
  | 'emotion'
  | 'eyeMatcap'
  | 'eyeHighlight'
  | 'eyeScatter'
  | 'eyeTint'
  | 'eyeParallax'
  | 'eyeLayer'
  | 'pantyhose'
  | 'browThrough'
  | 'vfx';

// STATIC: the gate selects the shader permutation — the subsystem's textures are bound and its
// hook compiled in only when the gate is on, so the gate is not a uniform (a uniform copy of a
// compile-time decision is how the two drift apart). NUMERIC: the gate stays a uniform field
// (declared in params.ts) that the shader reads at run time; the subsystem's resources are
// always bound.
export type HGRPSubsystemTier = 'static' | 'numeric';

// The WGSL side of a static subsystem: one hook function the shading core calls unconditionally.
// The include defines it when the subsystem is on; when off, wgsl.ts generates a stub with the
// same signature (copied from the include) returning `off`, so no branch and no texture
// declaration remain in the compiled shader.
export interface HGRPSubsystemHook {
  include: string; // fragment path relative to shaders/
  fn: string; // hook function name
  off: string; // return expression of the off-stub; may use the hook's parameter names
}

// A variant on which the subsystem consumes other slots, through another hook include, than
// on the rest of the family: the hair shader's _NORMALMAP reads _SplitNormalMap.rg where every
// other variant reads _BumpMap. The hook keeps its name and signature, so one off-stub serves
// every variant; a slot may then have several consumers on that variant (both hair normals
// read _SplitNormalMap), and it is bound while any of them is on.
export interface HGRPSubsystemVariantOverride {
  textures: readonly string[];
  include?: string;
}

export interface HGRPSubsystem {
  id: HGRPSubsystemId;
  // Master switch preset key; requires a tier.
  gate?: string;
  tier?: HGRPSubsystemTier;
  // Texture slots the subsystem consumes (the variant slot tables decide which variants bind
  // them; a static subsystem applies to a variant only when every slot is in its table).
  textures?: readonly string[];
  variants?: Partial<Record<HGRPShaderVariant, HGRPSubsystemVariantOverride>>;
  wgsl?: HGRPSubsystemHook;
  // The gate routes draw lists (DrawListBuilder / a pass stage reads it) rather than, or as
  // well as, selecting shader code. A static gate gets a calibration toggle only when something
  // consumes it — a hook or the draw lists; a slot-only subsystem awaiting its implementation
  // (HGRP_UNIMPLEMENTED_SLOTS) shows no dead switch.
  drawList?: true;
}

// Declaration order is the calibration GUI's widget order (params grouped by feature) and the
// canonical order of subsystem ids in a permutation shader id.
export const HGRP_SUBSYSTEMS: readonly HGRPSubsystem[] = [
  { id: 'surface' },
  { id: 'base', textures: ['_BaseMap'] },
  {
    id: 'ramp',
    gate: '_UseDiffRampMap',
    tier: 'static',
    textures: ['_DiffRampMap'],
    wgsl: {
      include: 'lighting/hgrp/ramp.wgsl',
      fn: 'hgrp_ramp',
      off: 'vec4<f32>(smoothstep(0.25, 1.0, shade))',
    },
  },
  { id: 'shadow' },
  {
    id: 'shadowLut',
    gate: '_UseShadowLutTex',
    tier: 'static',
    textures: ['_ShadowLutTex'],
    wgsl: {
      include: 'lighting/hgrp/shadow_lut.wgsl',
      fn: 'hgrp_shadow_color',
      off:
        'hgrp_shadow_color_adjust(base, hgrp_material.shadow_color_brightness, ' +
        'hgrp_material.shadow_color_saturation)',
    },
  },
  {
    id: 'normal',
    gate: '_UseBumpMap',
    tier: 'static',
    textures: ['_BumpMap'],
    // The hair shader's _NORMALMAP reads the diffuse half of _SplitNormalMap and never samples
    // _BumpMap (hair variant b126).
    variants: {
      CharacterNPR_Hair: {
        textures: ['_SplitNormalMap'],
        include: 'lighting/hgrp/hair_diffuse_normal.wgsl',
      },
    },
    wgsl: {
      include: 'lighting/hgrp/normal.wgsl',
      fn: 'hgrp_shading_normal',
      off: 'normalize(world_normal)',
    },
  },
  {
    id: 'sdf',
    gate: '_UseSDFLightmap',
    tier: 'static',
    textures: ['_SDFLightmap', '_SDFMask'],
    wgsl: {
      include: 'lighting/hgrp/sdf.wgsl',
      fn: 'hgrp_shade_coord',
      off: 'vec3<f32>(shade_nl, 0.0, 1.0)',
    },
  },
  { id: 'rim' },
  {
    id: 'spec',
    gate: '_UseSpecRampMap',
    tier: 'static',
    textures: ['_SpecRampMap'],
    wgsl: { include: 'lighting/hgrp/spec.wgsl', fn: 'hgrp_spec_ramp_color', off: 'vec3<f32>(1.0)' },
  },
  {
    id: 'metallicGloss',
    gate: '_UseMetallicGlossMap',
    tier: 'static',
    textures: ['_MetallicGlossMap'],
    wgsl: {
      include: 'lighting/hgrp/metallic_gloss.wgsl',
      fn: 'hgrp_metallic_gloss',
      off:
        'vec4<f32>(hgrp_material.metallic, hgrp_material.specular, 1.0, ' +
        'hgrp_material.smoothness)',
    },
  },
  {
    id: 'emission',
    gate: '_UseEmission',
    tier: 'static',
    textures: ['_EmissionMap'],
    wgsl: { include: 'lighting/hgrp/emission.wgsl', fn: 'hgrp_emission', off: 'vec3<f32>(0.0)' },
  },
  // Draw-list gate: the outline pass binds _OutlineMask in its own layout, so the subsystem
  // shapes no variant's shader and stays out of the permutation (permutation.ts).
  {
    id: 'outline',
    gate: '_EnableOutline',
    tier: 'static',
    textures: ['_OutlineMask'],
    drawList: true,
  },
  { id: 'hairBand' },
  {
    id: 'hairLines',
    gate: '_UseLineMap',
    tier: 'static',
    textures: ['_LineMap'],
    wgsl: {
      include: 'lighting/hgrp/hair_lines.wgsl',
      fn: 'hgrp_hair_line_pattern',
      off: 'ceil(clamp(fract(uv0.x * hgrp_material.line_amount) - 0.5, 0.0, 1.0))',
    },
  },
  {
    id: 'hairSplitNormal',
    gate: '_UseSpecBumpMap',
    tier: 'static',
    textures: ['_SplitNormalMap'],
    wgsl: {
      include: 'lighting/hgrp/hair_split_normal.wgsl',
      fn: 'hgrp_hair_spec_normal',
      off: 'normalize(world_normal)',
    },
  },
  {
    id: 'skinHighlight',
    gate: '_FaceHighlightMap',
    tier: 'static',
    textures: ['_HighlightMap'],
    wgsl: {
      include: 'lighting/hgrp/skin_highlight.wgsl',
      fn: 'hgrp_face_highlight',
      off: 'vec3<f32>(0.0)',
    },
  },
  { id: 'emotion', gate: '_UseEmotionMap', tier: 'static', textures: ['_EmotionMap'] },
  {
    id: 'eyeMatcap',
    gate: '_UseMatcap',
    tier: 'static',
    textures: ['_MatcapTex'],
    wgsl: {
      include: 'lighting/hgrp/eye_matcap.wgsl',
      fn: 'hgrp_eye_matcap',
      off: 'vec3<f32>(0.0)',
    },
  },
  { id: 'eyeHighlight', gate: '_EyeHighLight', tier: 'numeric' },
  { id: 'eyeScatter' },
  { id: 'eyeTint' },
  { id: 'eyeParallax' },
  { id: 'eyeLayer' },
  { id: 'pantyhose', gate: '_Pantyhose', tier: 'numeric' },
  // Draw-list gate whose mask the hair stencil pass samples through the material's own group 2,
  // so it does take part in the Hair permutation.
  {
    id: 'browThrough',
    gate: '_DrawUnderBrow',
    tier: 'static',
    textures: ['_HairBrowMask'],
    drawList: true,
  },
  { id: 'vfx', textures: ['_MainTex', '_BlendTex', '_DisturbTex1', '_MaskTex'] },
];

export function hgrpSubsystem(id: HGRPSubsystemId): HGRPSubsystem {
  const subsystem = HGRP_SUBSYSTEMS.find((candidate) => candidate.id === id);
  if (!subsystem) {
    throw new Error(`HGRP contract: unknown subsystem ${id}`);
  }
  return subsystem;
}

// The slots a subsystem consumes on a variant, and the hook include that samples them.
export function hgrpSubsystemTextures(
  subsystem: HGRPSubsystem,
  variant: HGRPShaderVariant,
): readonly string[] {
  return subsystem.variants?.[variant]?.textures ?? subsystem.textures ?? [];
}

export function hgrpSubsystemInclude(
  subsystem: HGRPSubsystem,
  variant: HGRPShaderVariant,
): string | undefined {
  return subsystem.variants?.[variant]?.include ?? subsystem.wgsl?.include;
}

// The subsystems that consume a texture slot on a variant (validate.ts guarantees every
// registered slot has a default owner; a variant override may add a second consumer).
export function hgrpSlotOwners(slot: string, variant: HGRPShaderVariant): HGRPSubsystem[] {
  return HGRP_SUBSYSTEMS.filter((subsystem) =>
    hgrpSubsystemTextures(subsystem, variant).includes(slot),
  );
}
