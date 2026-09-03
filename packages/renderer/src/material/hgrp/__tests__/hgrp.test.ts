import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultHGRPMaterial,
  createHGRPMaterialFromPreset,
  HGRP_MATERIAL_PARAMS,
  HGRP_MATERIAL_PARAMS_LAYOUT,
  HGRP_PARAMS_STRUCTS,
  HGRP_STATIC_SUBSYSTEMS,
  HGRP_TEXTURE_SLOTS,
  HGRP_TEXTURE_SLOTS_BY_VARIANT,
  HGRP_TUNABLE_COLORS,
  HGRP_TUNABLE_FLOATS,
  HGRP_VFX_PARAMS,
  HGRP_VFX_PARAMS_LAYOUT,
  hgrpAllTextureBindings,
  hgrpApplicableSubsystems,
  hgrpDebugSlotId,
  hgrpDebugViewFragment,
  hgrpGeneratedFragment,
  hgrpGroup2BindingsFragment,
  HGRPMaterialDescriptor,
  hgrpOffStubFragment,
  hgrpOffStubWgsl,
  hgrpParamsLayoutForVariant,
  HGRPPermutation,
  hgrpPermutationForShaderId,
  hgrpPermutationShaderId,
  hgrpRefreshPermutation,
  hgrpResolvePermutation,
  HGRPShaderVariant,
  hgrpSubsystem,
  hgrpSubsystemIncludes,
  hgrpTextureBindings,
  hgrpTextureWgslName,
  packHGRPParams,
  validateHGRPContract,
} from '..';
import { layoutUniformStruct } from '../../uniformStruct';

// The uniform byte layout (param ledger, "uniform 布局速查"). Pinned so a reordered or
// removed field is a conscious change, not a drift. The ten static gates (use_diff_ramp,
// use_shadow_lut, ...) left the struct when they became permutation selectors (2026-09-02);
// the two numeric gates (eye_highlight, use_pantyhose) stay. spec_bump_scale and
// sdf_rim_color were appended when the hair split-normal and SDF-mask hooks landed; metallic
// and the two _SDFRimColor off-scales with the decompiled-formula rewrite (2026-09-03).
const MATERIAL_PARAMS_F32_INDEX: Record<string, number> = {
  base_color: 0,
  rim_color: 4,
  alpha_cutoff: 8,
  shadow_color_brightness: 9,
  shadow_color_saturation: 10,
  bump_scale: 11,
  rim_intensity: 12,
  rim_width: 13,
  smoothness: 14,
  specular: 15,
  aniso_intensity: 16,
  matcap_normal_scale: 17,
  emission_color: 20,
  emission_brightness: 24,
  outline_width: 25,
  outline_color_brightness: 26,
  outline_color_saturation: 27,
  eye_highlight: 28,
  outline_offset_z: 29,
  matcap_color: 32,
  eye_highlight_color: 36,
  eye_scattering_color: 40,
  line_amount: 44,
  line_intensity: 45,
  line_range: 46,
  line_saturation: 47,
  line_value: 48,
  use_pantyhose: 49,
  pantyhose_specular_int: 50,
  pantyhose_specular_value: 51,
  pantyhose_aniso_direction: 52,
  aniso_value: 53,
  parallax_scale: 54,
  pantyhose_color: 56,
  highlight_vector: 60,
  eye_tint_color: 64,
  hair_brow_mask_threshold: 68,
  is_iris: 69,
  spec_bump_scale: 70,
  sdf_rim_color: 72,
  metallic: 76,
  skin_rim_off_scale: 77,
  face_rim_off_scale: 78,
};

const VFX_PARAMS_F32_INDEX: Record<string, number> = {
  tint_color: 0,
  blend_tint: 4,
  main_uv_speed: 8,
  main_uv_weights: 12,
  blend_uv_speed: 16,
  blend_uv_weights: 20,
  mask_uv_speed: 24,
  mask_uv_weights: 28,
  disturb_uv_speed: 32,
  disturb_uv_weights: 36,
  disturb_intensity: 40,
  tint_intensity: 42,
  tint_alpha: 43,
  use_blend: 44,
  use_disturb: 45,
  use_mask: 46,
  use_main_as_alpha: 47,
  use_mask_as_alpha: 48,
  main_use_disturb: 49,
  blend_use_disturb: 50,
  mask_use_disturb: 51,
  exp_intensity: 52,
  exp_threshold: 53,
};

function material(
  variant: HGRPShaderVariant,
  overrides: Partial<HGRPMaterialDescriptor> = {},
): HGRPMaterialDescriptor {
  return {
    materialType: 'hgrp',
    customShaderId: 'hgrp_npr_shader',
    materialKey: `hgrp_test_${variant}`,
    materialName: variant,
    variant,
    textures: {},
    floats: {},
    colors: {},
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
    blendMode: 'straight',
    permutation: { variant, enabled: [] },
    enabled: true,
    ...overrides,
  };
}

const preset = (
  shader: string,
  floats: Record<string, number>,
  textures: Record<string, string> = {},
) => ({
  shader,
  textures,
  floats,
  ints: {},
  colors: {},
});

describe('uniformStruct layout', () => {
  it('follows WGSL uniform alignment and rounds the struct size up to its alignment', () => {
    const layout = layoutUniformStruct('T', [
      { name: 'a', type: 'f32' },
      { name: 'b', type: 'vec4' },
      { name: 'c', type: 'vec2' },
      { name: 'd', type: 'f32' },
    ]);
    expect(layout.fields.map((f) => f.offset)).toEqual([0, 16, 32, 40]);
    expect(layout.byteSize).toBe(48);
    expect(layout.wgsl).toContain('struct T {');
    expect(layout.wgsl).toContain('    b: vec4<f32>,');
  });

  it('rejects duplicate field names', () => {
    expect(() =>
      layoutUniformStruct('T', [
        { name: 'a', type: 'f32' },
        { name: 'a', type: 'f32' },
      ]),
    ).toThrow(/duplicate/);
  });
});

describe('HGRP material contract', () => {
  it('is self-consistent', () => {
    expect(() => validateHGRPContract()).not.toThrow();
  });

  it('keeps the HGRPMaterialParams byte layout (320 bytes)', () => {
    expect(HGRP_MATERIAL_PARAMS_LAYOUT.byteSize).toBe(320);
    const actual = Object.fromEntries(
      HGRP_MATERIAL_PARAMS_LAYOUT.fields.map((f) => [f.name, f.offset / 4]),
    );
    expect(actual).toEqual(MATERIAL_PARAMS_F32_INDEX);
  });

  it('keeps the HGRPVfxParams byte layout (224 bytes)', () => {
    expect(HGRP_VFX_PARAMS_LAYOUT.byteSize).toBe(224);
    const actual = Object.fromEntries(
      HGRP_VFX_PARAMS_LAYOUT.fields.map((f) => [f.name, f.offset / 4]),
    );
    expect(actual).toEqual(VFX_PARAMS_F32_INDEX);
  });

  it('maps every variant to exactly one params struct', () => {
    for (const variant of Object.keys(HGRP_TEXTURE_SLOTS_BY_VARIANT) as HGRPShaderVariant[]) {
      const owners = HGRP_PARAMS_STRUCTS.filter((s) => s.variants.includes(variant));
      expect(owners).toHaveLength(1);
    }
    expect(hgrpParamsLayoutForVariant('CharacterNPR_Skin').structName).toBe('HGRPMaterialParams');
    expect(hgrpParamsLayoutForVariant('CharacterNPR_VFX').structName).toBe('HGRPVfxParams');
  });

  it('keeps no static gate in the uniform and every numeric gate in it', () => {
    const fieldKeys = new Set(
      HGRP_PARAMS_STRUCTS.flatMap((s) => s.fields.flatMap((f) => f.params.map((p) => p.key))),
    );
    for (const subsystem of HGRP_STATIC_SUBSYSTEMS) {
      expect(fieldKeys.has(subsystem.gate!), subsystem.gate).toBe(false);
    }
    expect(fieldKeys.has('_Pantyhose')).toBe(true);
    expect(fieldKeys.has('_EyeHighLight')).toBe(true);
  });

  it('derives texture binding numbers: samplers at 1..2, the variant slots from 3', () => {
    const skin = hgrpAllTextureBindings('CharacterNPR_Skin');
    expect(skin.map((b) => [b.binding, b.slot])).toEqual([
      [3, '_BaseMap'],
      [4, '_DiffRampMap'],
      [5, '_BumpMap'],
      [6, '_ShadowLutTex'],
      [7, '_SDFLightmap'],
      [8, '_SDFMask'],
      [9, '_HighlightMap'],
      [10, '_EmotionMap'],
      [11, '_EmissionMap'],
    ]);
    expect(hgrpAllTextureBindings('CharacterNPR_Eye').map((b) => b.binding)).toEqual([3, 4, 5, 6]);
    expect(hgrpAllTextureBindings('CharacterNPR_VFX').map((b) => b.slot)).toEqual([
      '_MainTex',
      '_BlendTex',
      '_DisturbTex1',
      '_MaskTex',
    ]);
    expect(skin.find((b) => b.slot === '_BaseMap')?.srgb).toBe(true);
    expect(skin.find((b) => b.slot === '_BumpMap')?.srgb).toBe(false);
  });

  it('binds only the enabled subsystems of a permutation, keeping the slot numbers', () => {
    const body: HGRPPermutation = {
      variant: 'CharacterNPR_Skin',
      enabled: ['ramp', 'shadowLut', 'normal'],
    };
    expect(hgrpTextureBindings(body).map((b) => [b.binding, b.slot])).toEqual([
      [3, '_BaseMap'],
      [4, '_DiffRampMap'],
      [5, '_BumpMap'],
      [6, '_ShadowLutTex'],
    ]);
    const iris: HGRPPermutation = { variant: 'CharacterNPR_Eye', enabled: ['ramp', 'eyeMatcap'] };
    expect(hgrpTextureBindings(iris).map((b) => [b.binding, b.slot])).toEqual([
      [3, '_BaseMap'],
      [4, '_DiffRampMap'],
      [5, '_MatcapTex'],
    ]);
    expect(
      hgrpTextureBindings({ variant: 'CharacterNPR', enabled: [] }).map((b) => b.slot),
    ).toEqual(['_BaseMap']);
    expect(
      hgrpTextureBindings({ variant: 'CharacterNPR_VFX', enabled: [] }).map((b) => b.binding),
    ).toEqual([3, 4, 5, 6]);
  });

  it('derives WGSL texture identifiers from slot names', () => {
    const names = Object.fromEntries(
      Object.keys(HGRP_TEXTURE_SLOTS).map((slot) => [slot, hgrpTextureWgslName(slot)]),
    );
    expect(names).toMatchObject({
      _BaseMap: 'base_map',
      _DiffRampMap: 'diff_ramp_map',
      _ShadowLutTex: 'shadow_lut_tex',
      _SDFLightmap: 'sdf_lightmap',
      _SDFMask: 'sdf_mask',
      _HairBrowMask: 'hair_brow_mask',
      _MetallicGlossMap: 'metallic_gloss_map',
      _MatcapTex: 'matcap_tex',
      _DisturbTex1: 'disturb_tex1',
    });
    expect(new Set(Object.values(names)).size).toBe(Object.keys(names).length);
  });

  it('exposes the calibration GUI schema (42 floats, 6 colors)', () => {
    expect(HGRP_TUNABLE_FLOATS.map((d) => d.key).sort()).toEqual(
      [
        '_UseDiffRampMap',
        '_UseShadowLutTex',
        '_UseBumpMap',
        '_UseSDFLightmap',
        '_UseSpecRampMap',
        '_UseMetallicGlossMap',
        '_UseEmission',
        '_EnableOutline',
        '_ShadowColorBrightness',
        '_ShadowColorSaturation',
        '_BumpScale',
        '_Smoothness',
        '_Specular',
        '_Metallic',
        '_SkinRimOffScale',
        '_FaceRimOffScale',
        '_AnisotropyIntensity',
        '_AnisotropyValue',
        '_UseMatcap',
        '_FaceHighlightMap',
        '_ParallaxScale',
        '_MatcapNormalScale',
        '_EyeHighLight',
        '_EmissionBrightness',
        '_OutlineWidth',
        '_OutlineColorBrightness',
        '_OutlineColorSaturation',
        '_OutlineOffsetZ',
        '_UseLineMap',
        '_UseSpecBumpMap',
        '_SpecBumpScale',
        '_DrawUnderBrow',
        '_HairBrowMaskThreshold',
        '_LineAmount',
        '_LineIntensity',
        '_LineRange',
        '_LineSaturation',
        '_LineValue',
        '_Pantyhose',
        '_PantyhoseSpecularInt',
        '_PantyhoseSpecularValue',
        '_PantyhoseAnisotropyDirection',
      ].sort(),
    );
    expect(HGRP_TUNABLE_COLORS.map((d) => d.key).sort()).toEqual(
      [
        '_BaseColor',
        '_EmissionColor',
        '_MatcapColor',
        '_PantyhoseColor',
        '_SDFRimColor',
        '_EyeTintColor',
      ].sort(),
    );
    const lineAmount = HGRP_TUNABLE_FLOATS.find((d) => d.key === '_LineAmount')!;
    expect(lineAmount).toEqual({ key: '_LineAmount', default: 300, min: 0, max: 600, step: 1 });
    const gate = HGRP_TUNABLE_FLOATS.find((d) => d.key === '_UseBumpMap')!;
    expect(gate).toEqual({ key: '_UseBumpMap', default: 0, min: 0, max: 1, step: 1 });
  });
});

describe('permutations', () => {
  it('lists the static subsystems that apply to each variant from the slot tables', () => {
    const ids = (variant: HGRPShaderVariant) => hgrpApplicableSubsystems(variant).map((s) => s.id);
    expect(ids('CharacterNPR')).toEqual([
      'ramp',
      'shadowLut',
      'normal',
      'spec',
      'metallicGloss',
      'emission',
    ]);
    expect(ids('CharacterNPR_Eye')).toEqual(['ramp', 'shadowLut', 'eyeMatcap']);
    expect(ids('CharacterNPR_Hair')).toContain('browThrough');
    expect(ids('CharacterNPR_VFX')).toEqual([]);
    // outline's mask lives in the outline pass's private layout: never in a permutation
    for (const variant of Object.keys(HGRP_TEXTURE_SLOTS_BY_VARIANT) as HGRPShaderVariant[]) {
      expect(ids(variant)).not.toContain('outline');
    }
  });

  it('enables a subsystem when its gate is on and its textures are present', () => {
    const { permutation, dropped } = hgrpResolvePermutation(
      'CharacterNPR_Skin',
      { _UseDiffRampMap: 1, _UseShadowLutTex: 1, _UseBumpMap: 1, _UseSDFLightmap: 0 },
      { _BaseMap: 'b', _DiffRampMap: 'r', _ShadowLutTex: 'l', _BumpMap: 'n', _SDFLightmap: 's' },
    );
    expect(permutation.enabled).toEqual(['ramp', 'shadowLut', 'normal']);
    expect(dropped).toEqual([]);
  });

  it('leaves a subsystem off, and reports it, when its gate is on but a texture is missing', () => {
    const { permutation, dropped } = hgrpResolvePermutation(
      'CharacterNPR_Hair',
      { _UseDiffRampMap: 1, _UseBumpMap: 1, _UseLineMap: 1, _DrawUnderBrow: 1 },
      { _DiffRampMap: 'r', _LineMap: 'l' },
    );
    expect(permutation.enabled).toEqual(['ramp', 'hairLines']);
    expect(dropped).toEqual([
      { subsystem: 'normal', gate: '_UseBumpMap', missing: ['_BumpMap'] },
      { subsystem: 'browThrough', gate: '_DrawUnderBrow', missing: ['_HairBrowMask'] },
    ]);
  });

  it('ignores gates of subsystems the variant does not bind', () => {
    const { permutation } = hgrpResolvePermutation(
      'CharacterNPR_Eye',
      { _UseEmission: 1, _UseSDFLightmap: 1, _UseMatcap: 1 },
      { _EmissionMap: 'e', _SDFLightmap: 's', _SDFMask: 'm', _MatcapTex: 'm' },
    );
    expect(permutation.enabled).toEqual(['eyeMatcap']);
  });

  it('serializes to a canonical shader id and parses it back', () => {
    const face: HGRPPermutation = {
      variant: 'CharacterNPR_Skin',
      enabled: ['ramp', 'shadowLut', 'normal', 'sdf', 'skinHighlight', 'emotion'],
    };
    const id = hgrpPermutationShaderId(face);
    expect(id).toBe('hgrp_skin_shader+ramp+shadowLut+normal+sdf+skinHighlight+emotion');
    expect(hgrpPermutationForShaderId(id)).toEqual(face);
    expect(hgrpPermutationShaderId({ variant: 'CharacterNPR_VFX', enabled: [] })).toBe(
      'hgrp_vfx_shader',
    );
    expect(hgrpPermutationForShaderId('hgrp_vfx_shader')).toEqual({
      variant: 'CharacterNPR_VFX',
      enabled: [],
    });
    expect(() => hgrpPermutationForShaderId('hgrp_skin_shader+normal+ramp')).toThrow(/order/);
    expect(() => hgrpPermutationForShaderId('hgrp_skin_shader+ramp+ramp')).toThrow(/order/);
    expect(() => hgrpPermutationForShaderId('hgrp_skin_shader+eyeMatcap')).toThrow(
      /does not apply/,
    );
    expect(() => hgrpPermutationForShaderId('hgrp_outline_shader')).toThrow(/Unknown/);
  });

  it('resolves the permutation in the preset factory and writes it into customShaderId', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const iris = createHGRPMaterialFromPreset(
      'c',
      'iris',
      preset(
        'HGRP/CharacterNPR_Eye',
        { _EyeHighLight: 1, _UseDiffRampMap: 1, _UseMatcap: 1 },
        { _BaseMap: 'b', _DiffRampMap: 'r', _MatcapTex: 'm' },
      ),
    );
    expect(iris.permutation).toEqual({
      variant: 'CharacterNPR_Eye',
      enabled: ['ramp', 'eyeMatcap'],
    });
    expect(iris.customShaderId).toBe('hgrp_eye_shader+ramp+eyeMatcap');
    expect(warn).not.toHaveBeenCalled();

    const hair = createHGRPMaterialFromPreset(
      'c',
      'hair',
      preset('HGRP/CharacterNPR_Hair', { _UseBumpMap: 1 }, { _BaseMap: 'b' }),
    );
    expect(hair.customShaderId).toBe('hgrp_hair_shader');
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/hair: .*normal \(_UseBumpMap on, no _BumpMap\)/),
    );

    const fill = createDefaultHGRPMaterial('c', 'shell');
    expect(fill.customShaderId).toBe('hgrp_npr_shader');
    expect(fill.permutation.enabled).toEqual([]);
    warn.mockRestore();
  });

  it('re-resolves after a gate edit (the calibration GUI path)', () => {
    const m = material('CharacterNPR', {
      textures: { _BaseMap: 'b', _EmissionMap: 'e' },
      floats: { _UseEmission: 0 },
    });
    hgrpRefreshPermutation(m);
    expect(m.customShaderId).toBe('hgrp_npr_shader');
    m.floats._UseEmission = 1;
    hgrpRefreshPermutation(m);
    expect(m.customShaderId).toBe('hgrp_npr_shader+emission');
    expect(m.permutation.enabled).toEqual(['emission']);
  });
});

describe('generated WGSL', () => {
  const lookup = (path: string) => `fn ${path}`;

  it('generates one struct fragment per params struct', () => {
    expect(hgrpGeneratedFragment(HGRP_MATERIAL_PARAMS_LAYOUT.fragmentPath, lookup)).toContain(
      'struct HGRPMaterialParams {',
    );
    expect(hgrpGeneratedFragment(HGRP_VFX_PARAMS_LAYOUT.fragmentPath, lookup)).toContain(
      'struct HGRPVfxParams {',
    );
    expect(hgrpGeneratedFragment('generated/other.wgsl', lookup)).toBeUndefined();
    expect(hgrpGeneratedFragment('lighting/hgrp_npr.wgsl', lookup)).toBeUndefined();
  });

  it('declares only the permutation slots in its group-2 fragment', () => {
    const iris: HGRPPermutation = { variant: 'CharacterNPR_Eye', enabled: ['ramp', 'eyeMatcap'] };
    const path = hgrpGroup2BindingsFragment(iris);
    expect(path).toBe('generated/hgrp_group2_hgrp_eye_shader+ramp+eyeMatcap.wgsl');
    const eye = hgrpGeneratedFragment(path, lookup)!;
    expect(eye).toContain('@group(2) @binding(0) var<uniform> hgrp_material: HGRPMaterialParams;');
    expect(eye).toContain('@group(2) @binding(1) var base_sampler: sampler;');
    expect(eye).toContain('@group(2) @binding(2) var ramp_sampler: sampler;');
    expect(eye).toContain('@group(2) @binding(3) var base_map: texture_2d<f32>;');
    expect(eye).toContain('@group(2) @binding(4) var diff_ramp_map: texture_2d<f32>;');
    expect(eye).toContain('@group(2) @binding(5) var matcap_tex: texture_2d<f32>;');
    expect(eye).not.toContain('shadow_lut_tex');

    const vfx = hgrpGeneratedFragment(
      hgrpGroup2BindingsFragment({ variant: 'CharacterNPR_VFX', enabled: [] }),
      lookup,
    )!;
    expect(vfx).toContain('@group(2) @binding(0) var<uniform> hgrp_vfx: HGRPVfxParams;');
    expect(vfx).toContain('@group(2) @binding(6) var mask_tex: texture_2d<f32>;');
    expect(vfx).not.toContain('base_map');
  });

  it('generates the debug view over the permutation slots by registry slot id', () => {
    const iris: HGRPPermutation = { variant: 'CharacterNPR_Eye', enabled: ['ramp', 'eyeMatcap'] };
    const path = hgrpDebugViewFragment(iris);
    expect(path).toBe('generated/hgrp_debug_hgrp_eye_shader+ramp+eyeMatcap.wgsl');
    const view = hgrpGeneratedFragment(path, lookup)!;
    expect(view).toContain('fn hgrp_debug_view(shaded: vec4<f32>, uv0: vec2<f32>) -> vec4<f32>');
    expect(view).toContain(`case ${hgrpDebugSlotId('_BaseMap')}: { // _BaseMap`);
    expect(view).toContain(`case ${hgrpDebugSlotId('_MatcapTex')}: { // _MatcapTex`);
    expect(view).not.toContain('shadow_lut_tex');
    expect(hgrpDebugSlotId('_BaseMap')).toBe(0);
    expect(() => hgrpDebugSlotId('_Nothing')).toThrow(/unregistered/);
  });

  it('copies the hook signature into the off-stub', () => {
    const emission = hgrpSubsystem('emission');
    const stub = hgrpOffStubWgsl(
      emission,
      '// comment\nfn hgrp_emission(uv0: vec2<f32>) -> vec3<f32> {\n    return vec3<f32>(1.0);\n}\n',
    );
    expect(stub).toContain('fn hgrp_emission(uv0: vec2<f32>) -> vec3<f32> {');
    expect(stub).toContain('return vec3<f32>(0.0);');
    expect(stub).not.toContain('emission_map');

    const normal = hgrpSubsystem('normal');
    const multiline = hgrpOffStubWgsl(
      normal,
      'fn hgrp_shading_normal(\n    world_normal: vec3<f32>,\n    uv: vec2<f32>,\n) -> vec3<f32> {\n    return world_normal;\n}',
    );
    expect(multiline).toContain(
      'fn hgrp_shading_normal(\n    world_normal: vec3<f32>,\n    uv: vec2<f32>,\n) -> vec3<f32> {',
    );
    expect(multiline).toContain('return normalize(world_normal);');

    expect(() => hgrpOffStubWgsl(emission, 'fn other() -> f32 { return 0.0; }')).toThrow(
      /exactly once/,
    );
    expect(() => hgrpGeneratedFragment(hgrpOffStubFragment('emission'), () => undefined)).toThrow(
      /not registered/,
    );
    expect(() => hgrpGeneratedFragment(hgrpOffStubFragment('emotion'), lookup)).toThrow(/no hook/);
  });

  it('selects the hook include or the off-stub per static subsystem', () => {
    const includes = hgrpSubsystemIncludes({
      variant: 'CharacterNPR_Skin',
      enabled: ['ramp', 'shadowLut', 'normal'],
    });
    expect(includes).toContain('lighting/hgrp/ramp.wgsl');
    expect(includes).toContain('lighting/hgrp/normal.wgsl');
    expect(includes).toContain(hgrpOffStubFragment('sdf'));
    expect(includes).toContain(hgrpOffStubFragment('emission'));
    expect(includes).not.toContain(hgrpOffStubFragment('ramp'));
    // hook-less static subsystems (emotion, browThrough, outline) add nothing
    expect(includes.some((p) => p.includes('emotion'))).toBe(false);
    expect(includes).toHaveLength(HGRP_STATIC_SUBSYSTEMS.filter((s) => s.wgsl).length);
  });
});

describe('eye layer role', () => {
  it('is derived from the catchlight gate, not from the matcap texture', () => {
    const iris = createHGRPMaterialFromPreset(
      'c',
      'iris',
      preset('HGRP/CharacterNPR_Eye', { _EyeHighLight: 1, _UseMatcap: 0 }),
    );
    const brow = createHGRPMaterialFromPreset(
      'c',
      'brow',
      preset('HGRP/CharacterNPR_Eye', { _EyeHighLight: 0, _UseMatcap: 0 }),
    );
    const cloth = createHGRPMaterialFromPreset(
      'c',
      'cloth',
      preset('HGRP/CharacterNPR', { _EyeHighLight: 1 }),
    );
    expect(iris.eyeLayer).toBe('iris');
    expect(brow.eyeLayer).toBe('brow');
    expect(cloth.eyeLayer).toBeUndefined();
    expect(
      packHGRPParams(HGRP_MATERIAL_PARAMS_LAYOUT, iris)[MATERIAL_PARAMS_F32_INDEX.is_iris],
    ).toBe(1);
    expect(
      packHGRPParams(HGRP_MATERIAL_PARAMS_LAYOUT, brow)[MATERIAL_PARAMS_F32_INDEX.is_iris],
    ).toBe(0);
  });
});

describe('packHGRPParams', () => {
  it('packs defaults when a preset omits every key', () => {
    const packed = packHGRPParams(HGRP_MATERIAL_PARAMS_LAYOUT, material('CharacterNPR'));
    expect(packed).toHaveLength(80);
    expect(Array.from(packed.subarray(0, 8))).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.rim_width]).toBeCloseTo(0.35);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.line_amount]).toBe(300);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.aniso_value]).toBe(0.5);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.alpha_cutoff]).toBe(0);
  });

  it('applies the composite rules: hair tint, alpha clip; the SDF tint color and its off-scales have their own fields', () => {
    const packed = packHGRPParams(
      HGRP_MATERIAL_PARAMS_LAYOUT,
      material('CharacterNPR_Skin', {
        alphaMode: 'mask',
        alphaCutoff: 0.42,
        floats: {
          _ColorAdjustmentRimIntensity: 4,
          _SkinRimOff: 1,
          _SkinRimOffScale: 0.25,
          _FaceRimOffScale: 0.5,
        },
        colors: {
          _BaseColor: [0.5, 1, 1, 0.8],
          _HairBaseTintColor: [2, 0.5, 1, 0],
          _SDFRimColor: [0.65, 0.4, 0.42, 1],
          _ColorAdjustmentRimColor: [1, 1, 1, 1],
        },
      }),
    );
    expect(Array.from(packed.subarray(0, 4)).map((v) => +v.toFixed(3))).toEqual([1, 0.5, 1, 0.8]);
    expect(Array.from(packed.subarray(4, 8))).toEqual([1, 1, 1, 1]);
    const sdfRim = MATERIAL_PARAMS_F32_INDEX.sdf_rim_color;
    expect(Array.from(packed.subarray(sdfRim, sdfRim + 4)).map((v) => +v.toFixed(2))).toEqual([
      0.65, 0.4, 0.42, 1,
    ]);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.alpha_cutoff]).toBeCloseTo(0.42);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.rim_intensity]).toBe(4);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.skin_rim_off_scale]).toBeCloseTo(0.25);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.face_rim_off_scale]).toBeCloseTo(0.5);
  });

  it('round-trips every direct param through its field offset', () => {
    const floats: Record<string, number> = {};
    const colors: Record<string, [number, number, number, number]> = {};
    let i = 1;
    for (const struct of [HGRP_MATERIAL_PARAMS, HGRP_VFX_PARAMS]) {
      for (const field of struct.fields) {
        for (const param of field.params) {
          if (param.kind === 'float') {
            floats[param.key] = i++;
          } else {
            colors[param.key] = [i++, i++, i++, i++];
          }
        }
      }
    }
    for (const [variant, layout] of [
      ['CharacterNPR', HGRP_MATERIAL_PARAMS_LAYOUT],
      ['CharacterNPR_VFX', HGRP_VFX_PARAMS_LAYOUT],
    ] as const) {
      const packed = packHGRPParams(layout, material(variant, { floats, colors }));
      for (const field of layout.fields) {
        if (field.pack) {
          continue;
        }
        const param = field.params[0];
        const expected = param.kind === 'float' ? [floats[param.key]] : colors[param.key];
        expect(
          Array.from(packed.subarray(field.offset / 4, field.offset / 4 + expected.length)),
        ).toEqual(expected);
      }
    }
  });
});
