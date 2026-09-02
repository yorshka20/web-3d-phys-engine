import { describe, expect, it } from 'vitest';
import {
  createHGRPMaterialFromPreset,
  HGRP_MATERIAL_PARAMS,
  HGRP_MATERIAL_PARAMS_LAYOUT,
  HGRP_PARAMS_STRUCTS,
  HGRP_TEXTURE_SLOTS,
  HGRP_TEXTURE_SLOTS_BY_VARIANT,
  HGRP_TUNABLE_COLORS,
  HGRP_TUNABLE_FLOATS,
  HGRP_VFX_PARAMS,
  HGRP_VFX_PARAMS_LAYOUT,
  hgrpGeneratedShaderFragments,
  hgrpGroup2BindingsFragment,
  HGRPMaterialDescriptor,
  hgrpParamsLayoutForVariant,
  HGRPShaderVariant,
  hgrpTextureBindings,
  hgrpTextureWgslName,
  packHGRPParams,
  validateHGRPContract,
} from '..';
import { layoutUniformStruct } from '../../uniformStruct';

// The uniform byte layout as it was hand-written before the contract existed (param ledger,
// "uniform 布局速查"). Pinned so a reordered field table is a conscious change, not a drift.
const MATERIAL_PARAMS_F32_INDEX: Record<string, number> = {
  base_color: 0,
  rim_color: 4,
  use_diff_ramp: 8,
  alpha_cutoff: 9,
  shadow_color_brightness: 10,
  shadow_color_saturation: 11,
  use_shadow_lut: 12,
  use_bump_map: 13,
  bump_scale: 14,
  use_sdf_lightmap: 15,
  rim_intensity: 16,
  rim_width: 17,
  use_spec_ramp: 18,
  spec_smoothness: 19,
  spec_intensity: 20,
  aniso_intensity: 21,
  use_matcap: 22,
  matcap_normal_scale: 23,
  emission_color: 24,
  use_emission: 28,
  emission_brightness: 29,
  outline_width: 30,
  outline_color_brightness: 31,
  outline_color_saturation: 32,
  eye_highlight: 33,
  outline_offset_z: 34,
  use_line_map: 35,
  matcap_color: 36,
  eye_highlight_color: 40,
  eye_scattering_color: 44,
  line_amount: 48,
  line_intensity: 49,
  line_range: 50,
  line_saturation: 51,
  line_value: 52,
  use_pantyhose: 53,
  pantyhose_specular_int: 54,
  pantyhose_specular_value: 55,
  pantyhose_aniso_direction: 56,
  aniso_value: 57,
  use_face_highlight: 58,
  parallax_scale: 59,
  pantyhose_color: 60,
  highlight_vector: 64,
  eye_tint_color: 68,
  use_metallic_gloss_map: 72,
  hair_brow_mask_threshold: 73,
  is_iris: 74,
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
    enabled: true,
    ...overrides,
  };
}

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

  it('keeps the HGRPMaterialParams byte layout (304 bytes, hand-written order)', () => {
    expect(HGRP_MATERIAL_PARAMS_LAYOUT.byteSize).toBe(304);
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

  it('derives texture binding numbers: common at 1..2, samplers at 3..4, variant from 5', () => {
    const skin = hgrpTextureBindings('CharacterNPR_Skin');
    expect(skin.map((b) => [b.binding, b.slot])).toEqual([
      [1, '_BaseMap'],
      [2, '_DiffRampMap'],
      [5, '_BumpMap'],
      [6, '_ShadowLutTex'],
      [7, '_SDFLightmap'],
      [8, '_SDFMask'],
      [9, '_HighlightMap'],
      [10, '_EmotionMap'],
      [11, '_EmissionMap'],
    ]);
    expect(hgrpTextureBindings('CharacterNPR_Eye').map((b) => b.binding)).toEqual([1, 2, 5, 6]);
    expect(skin.find((b) => b.slot === '_BaseMap')?.srgb).toBe(true);
    expect(skin.find((b) => b.slot === '_BumpMap')?.srgb).toBe(false);
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

  it('generates one struct fragment per params struct and one group-2 fragment per variant', () => {
    const fragments = new Map(hgrpGeneratedShaderFragments());
    expect(fragments.get(HGRP_MATERIAL_PARAMS_LAYOUT.fragmentPath)).toContain(
      'struct HGRPMaterialParams {',
    );
    expect(fragments.get(HGRP_VFX_PARAMS_LAYOUT.fragmentPath)).toContain('struct HGRPVfxParams {');

    const eye = fragments.get(hgrpGroup2BindingsFragment('CharacterNPR_Eye'))!;
    expect(eye).toContain('@group(2) @binding(0) var<uniform> hgrp_material: HGRPMaterialParams;');
    expect(eye).toContain('@group(2) @binding(3) var base_sampler: sampler;');
    expect(eye).toContain('@group(2) @binding(4) var ramp_sampler: sampler;');
    expect(eye).toContain('@group(2) @binding(5) var matcap_tex: texture_2d<f32>;');
    expect(eye).toContain('@group(2) @binding(6) var shadow_lut_tex: texture_2d<f32>;');

    const vfx = fragments.get(hgrpGroup2BindingsFragment('CharacterNPR_VFX'))!;
    expect(vfx).toContain('@group(2) @binding(0) var<uniform> hgrp_vfx: HGRPVfxParams;');
    expect(vfx).toContain('@group(2) @binding(8) var mask_tex: texture_2d<f32>;');
  });

  it('exposes the same calibration GUI schema the panel used before (39 floats, 7 colors)', () => {
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
        '_ColorAdjustmentRimIntensity',
        '_ColorAdjustmentRimWidth',
        '_Smoothness',
        '_Specular',
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
        '_ColorAdjustmentRimColor',
        '_EmissionColor',
        '_MatcapColor',
        '_PantyhoseColor',
        '_SDFRimColor',
        '_EyeTintColor',
      ].sort(),
    );
    const lineAmount = HGRP_TUNABLE_FLOATS.find((d) => d.key === '_LineAmount')!;
    expect(lineAmount).toEqual({ key: '_LineAmount', default: 300, min: 0, max: 600, step: 1 });
  });
});

describe('eye layer role', () => {
  const preset = (shader: string, floats: Record<string, number>) => ({
    shader,
    textures: {},
    floats,
    ints: {},
    colors: {},
  });

  it('is derived from the catchlight gate, not from the matcap texture', () => {
    const iris = createHGRPMaterialFromPreset(
      'c',
      'iris',
      preset('HGRP/CharacterNPR_Eye', { _EyeHighLight: 1, _UseMatcap: 0 }),
    );
    const brow = createHGRPMaterialFromPreset(
      'c',
      'brow',
      preset('HGRP/CharacterNPR_Eye', { _EyeHighLight: 0, _UseMatcap: 1 }),
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
    expect(packed).toHaveLength(76);
    expect(Array.from(packed.subarray(0, 8))).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.rim_width]).toBeCloseTo(0.35);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.line_amount]).toBe(300);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.aniso_value]).toBe(0.5);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.alpha_cutoff]).toBe(0);
  });

  it('applies the composite rules: hair tint, skin rim color, rim off-scale, alpha clip', () => {
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
    expect(Array.from(packed.subarray(4, 8)).map((v) => +v.toFixed(2))).toEqual([
      0.65, 0.4, 0.42, 1,
    ]);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.alpha_cutoff]).toBeCloseTo(0.42);
    expect(packed[MATERIAL_PARAMS_F32_INDEX.rim_intensity]).toBeCloseTo(4 * 0.25 * 0.5);
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
