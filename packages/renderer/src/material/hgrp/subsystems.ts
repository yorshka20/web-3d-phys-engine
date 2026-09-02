import type { HGRPFloatParam } from './primitives';

// A SUBSYSTEM is one feature of the HGRP shading model: a master switch, the texture slots it
// consumes and (through the field tables in params.ts, which tag every field with a subsystem
// id) its numeric parameters. Pure data — the tier classification and permutation-key use are
// described in learnings shader-feature-gating.md.

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

export interface HGRPSubsystem {
  id: HGRPSubsystemId;
  // Master switch preset key. Declared here so the future permutation key can read it; it
  // must be a param of some field or a list param (validate.ts).
  gate?: string;
  // Texture slots the subsystem consumes (the variant slot tables decide which are bound).
  textures?: readonly string[];
  // Params consumed by the draw-list / pass orchestration instead of the uniform.
  listParams?: readonly HGRPFloatParam[];
}

const TOGGLE = { min: 0, max: 1, step: 1 };

// Declaration order is the calibration GUI's widget order (params grouped by feature).
export const HGRP_SUBSYSTEMS: readonly HGRPSubsystem[] = [
  { id: 'surface' },
  { id: 'base', textures: ['_BaseMap'] },
  { id: 'ramp', gate: '_UseDiffRampMap', textures: ['_DiffRampMap'] },
  { id: 'shadow' },
  { id: 'shadowLut', gate: '_UseShadowLutTex', textures: ['_ShadowLutTex'] },
  { id: 'normal', gate: '_UseBumpMap', textures: ['_BumpMap'] },
  { id: 'sdf', gate: '_UseSDFLightmap', textures: ['_SDFLightmap', '_SDFMask'] },
  { id: 'rim' },
  { id: 'spec', gate: '_UseSpecRampMap', textures: ['_SpecRampMap'] },
  { id: 'metallicGloss', gate: '_UseMetallicGlossMap', textures: ['_MetallicGlossMap'] },
  { id: 'emission', gate: '_UseEmission', textures: ['_EmissionMap'] },
  {
    id: 'outline',
    gate: '_EnableOutline',
    textures: ['_OutlineMask'],
    listParams: [{ kind: 'float', key: '_EnableOutline', default: 0, gui: TOGGLE }],
  },
  { id: 'hairBand' },
  { id: 'hairLines', gate: '_UseLineMap', textures: ['_LineMap'] },
  { id: 'hairSplitNormal', gate: '_UseSpecBumpMap', textures: ['_SplitNormalMap'] },
  { id: 'skinHighlight', gate: '_FaceHighlightMap', textures: ['_HighlightMap'] },
  { id: 'emotion', gate: '_UseEmotionMap', textures: ['_EmotionMap'] },
  { id: 'eyeMatcap', gate: '_UseMatcap', textures: ['_MatcapTex'] },
  { id: 'eyeHighlight', gate: '_EyeHighLight' },
  { id: 'eyeScatter' },
  { id: 'eyeTint' },
  { id: 'eyeParallax' },
  { id: 'eyeLayer' },
  { id: 'pantyhose', gate: '_Pantyhose' },
  {
    id: 'browThrough',
    gate: '_DrawUnderBrow',
    textures: ['_HairBrowMask'],
    listParams: [{ kind: 'float', key: '_DrawUnderBrow', default: 0, gui: TOGGLE }],
  },
  { id: 'vfx', textures: ['_MainTex', '_BlendTex', '_DisturbTex1', '_MaskTex'] },
];
