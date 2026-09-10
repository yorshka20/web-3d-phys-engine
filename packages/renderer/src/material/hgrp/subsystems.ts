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
  | 'vfxSpecial'
  | 'fur'
  | 'furDye'
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

// The WGSL side of a static subsystem: the hook functions the shading stages call
// unconditionally, all defined by one include. The include defines them when the subsystem is
// on; when off, wgsl.ts generates a stub per hook with the same signature (copied from the
// include) returning `off`, so no branch and no texture declaration remain in the compiled
// shader. Most subsystems have one hook; the fur has one per stage (the vertex extrusion and the
// fragment coverage).
export interface HGRPHookFn {
  fn: string; // hook function name
  off: string; // return expression of the off-stub; may use the hook's parameter names
}

export interface HGRPSubsystemHook {
  include: string; // fragment path relative to shaders/
  hooks: readonly HGRPHookFn[];
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
  // well as, selecting shader code, and only the listed variants' shaders carry the pass that
  // reads it: a material asset keeps the property whatever shader it is on (jsspsi's effect
  // materials carry _EnableOutline 1 though the effect shader has a single pass), so the gate
  // is read only where the pass exists (hgrpDrawListGateOn). A static gate gets a calibration
  // toggle only when something consumes it — a hook or the draw lists; a slot-only subsystem
  // awaiting its implementation (HGRP_UNIMPLEMENTED_SLOTS) shows no dead switch.
  drawList?: { variants: readonly HGRPShaderVariant[] };
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
      hooks: [{ fn: 'hgrp_ramp', off: 'vec4<f32>(smoothstep(0.25, 1.0, shade))' }],
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
      hooks: [
        {
          fn: 'hgrp_shadow_color',
          off:
            'hgrp_shadow_color_adjust(base, hgrp_material.shadow_color_brightness, ' +
            'hgrp_material.shadow_color_saturation)',
        },
      ],
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
      hooks: [{ fn: 'hgrp_shading_normal', off: 'normalize(world_normal)' }],
    },
  },
  {
    id: 'sdf',
    gate: '_UseSDFLightmap',
    tier: 'static',
    textures: ['_SDFLightmap', '_SDFMask'],
    wgsl: {
      include: 'lighting/hgrp/sdf.wgsl',
      hooks: [{ fn: 'hgrp_shade_coord', off: 'vec3<f32>(shade_nl, 0.0, 1.0)' }],
    },
  },
  { id: 'rim' },
  {
    id: 'spec',
    gate: '_UseSpecRampMap',
    tier: 'static',
    textures: ['_SpecRampMap'],
    wgsl: {
      include: 'lighting/hgrp/spec.wgsl',
      hooks: [{ fn: 'hgrp_spec_ramp_color', off: 'vec3<f32>(1.0)' }],
    },
  },
  {
    id: 'metallicGloss',
    gate: '_UseMetallicGlossMap',
    tier: 'static',
    textures: ['_MetallicGlossMap'],
    wgsl: {
      include: 'lighting/hgrp/metallic_gloss.wgsl',
      hooks: [
        {
          fn: 'hgrp_metallic_gloss',
          off:
            'vec4<f32>(hgrp_material.metallic, hgrp_material.specular, 1.0, ' +
            'hgrp_material.smoothness)',
        },
      ],
    },
  },
  {
    id: 'emission',
    gate: '_UseEmission',
    tier: 'static',
    textures: ['_EmissionMap'],
    wgsl: {
      include: 'lighting/hgrp/emission.wgsl',
      hooks: [{ fn: 'hgrp_emission', off: 'vec3<f32>(0.0)' }],
    },
  },
  // The character VFX layer, the game's _CHARACTER_VFX_SPECIAL keyword of the standard shader
  // (hgrp-decompiled-formulas.md §6.1): an HDR flow layer added to the shaded color — the embers
  // along Laevatian's cloth edges, the fissure glow through Ardelia's fur. Distinct from `vfx`
  // below, which is the stand-alone CharacterNPR_VFX effect material.
  {
    id: 'vfxSpecial',
    gate: '_EnableCharacterVFX',
    tier: 'static',
    textures: ['_VFXSpecialMainTex', '_VFXSpecialBlendTex'],
    wgsl: {
      include: 'lighting/hgrp/vfx_special.wgsl',
      hooks: [{ fn: 'hgrp_vfx_special', off: 'vec3<f32>(0.0)' }],
    },
  },
  // Fur (the standard shader's _CHARACTER_FUR keyword; formulas §6.2): the shells baked into the
  // mesh get pushed out per layer in the vertex stage and cut into strands, root-shaded and
  // lit toward the tips in the fragment stage. The noise map falls back to the Properties
  // white when a preset sets none (Ardelia's does).
  {
    id: 'fur',
    gate: '_UseCharacterFur',
    tier: 'static',
    textures: ['_FurDirMap', '_FurMap'],
    wgsl: {
      include: 'lighting/hgrp/fur.wgsl',
      hooks: [
        { fn: 'hgrp_fur_extrude', off: 'clip' },
        { fn: 'hgrp_fur', off: 'HGRPFur(1.0, 0.0, 1.0, 0.0)' },
      ],
    },
  },
  // The fur's dye layer (_CHARACTER_FUR_DYE, its own keyword in the game): a screen blend of
  // the dye map into the base color ahead of the shade blend.
  {
    id: 'furDye',
    gate: '_FurDyeEnable',
    tier: 'static',
    textures: ['_FurDyeMap'],
    wgsl: {
      include: 'lighting/hgrp/fur_dye.wgsl',
      hooks: [{ fn: 'hgrp_fur_dye', off: 'albedo' }],
    },
  },
  // Draw-list gate: the outline pass binds _OutlineMask in its own layout, so the subsystem
  // shapes no variant's shader and stays out of the permutation (permutation.ts). The pass is
  // the CharacterNPR family's second pass; the effect and shadow-shell shaders have none.
  {
    id: 'outline',
    gate: '_EnableOutline',
    tier: 'static',
    textures: ['_OutlineMask'],
    drawList: {
      variants: ['CharacterNPR', 'CharacterNPR_Skin', 'CharacterNPR_Hair', 'CharacterNPR_Eye'],
    },
  },
  { id: 'hairBand' },
  {
    id: 'hairLines',
    gate: '_UseLineMap',
    tier: 'static',
    textures: ['_LineMap'],
    wgsl: {
      include: 'lighting/hgrp/hair_lines.wgsl',
      hooks: [
        {
          fn: 'hgrp_hair_line_pattern',
          off: 'ceil(clamp(fract(uv0.x * hgrp_material.line_amount) - 0.5, 0.0, 1.0))',
        },
      ],
    },
  },
  {
    id: 'hairSplitNormal',
    gate: '_UseSpecBumpMap',
    tier: 'static',
    textures: ['_SplitNormalMap'],
    wgsl: {
      include: 'lighting/hgrp/hair_split_normal.wgsl',
      hooks: [{ fn: 'hgrp_hair_spec_normal', off: 'normalize(world_normal)' }],
    },
  },
  {
    id: 'skinHighlight',
    gate: '_FaceHighlightMap',
    tier: 'static',
    textures: ['_HighlightMap'],
    wgsl: {
      include: 'lighting/hgrp/skin_highlight.wgsl',
      hooks: [{ fn: 'hgrp_face_highlight', off: 'vec3<f32>(0.0)' }],
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
      hooks: [{ fn: 'hgrp_eye_matcap', off: 'HGRPEyeMatcap(vec2<f32>(0.0), vec3<f32>(0.0))' }],
    },
  },
  { id: 'eyeHighlight', gate: '_EyeHighLight', tier: 'numeric' },
  { id: 'eyeScatter' },
  { id: 'eyeTint' },
  { id: 'eyeParallax' },
  { id: 'eyeLayer' },
  { id: 'pantyhose', gate: '_Pantyhose', tier: 'numeric' },
  // The hair's cut-out over the brow (formulas §5): where the mask is below
  // _HairBrowMaskThreshold the hair's own draws — the material and its outline hull — discard,
  // so the brow and the skin under those strands show. Off-stub: an opaque mask.
  {
    id: 'browThrough',
    gate: '_DrawUnderBrow',
    tier: 'static',
    textures: ['_HairBrowMask'],
    wgsl: {
      include: 'lighting/hgrp/brow_cutout.wgsl',
      hooks: [{ fn: 'hgrp_brow_cutout', off: '1.0' }],
    },
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
