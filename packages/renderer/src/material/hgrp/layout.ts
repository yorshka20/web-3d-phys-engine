import { layoutUniformStruct, UniformStructLayout } from '../uniformStruct';
import type { HGRPMaterialDescriptor, HGRPShaderVariant } from './descriptor';
import { HGRP_MATERIAL_PARAMS, HGRP_VFX_PARAMS, hgrpParamsStructForVariant } from './params';
import { HGRPParamsStruct, HGRPUniformField, readHGRPParam } from './primitives';

// Byte layouts of the two uniform structs and the packer that fills them from a descriptor.
// Offsets come from the WGSL alignment rules applied to the field tables (uniformStruct.ts),
// so the CPU side and the generated WGSL struct agree by construction.

export type HGRPParamsLayout = UniformStructLayout<HGRPUniformField> & {
  uniformVar: string;
  // Path the generated struct declaration is registered under in shaderFragmentRegistry
  fragmentPath: string;
};

function layoutParams(struct: HGRPParamsStruct, fragmentPath: string): HGRPParamsLayout {
  return {
    ...layoutUniformStruct(struct.structName, struct.fields, struct.header),
    uniformVar: struct.uniformVar,
    fragmentPath,
  };
}

export const HGRP_MATERIAL_PARAMS_LAYOUT = layoutParams(
  HGRP_MATERIAL_PARAMS,
  'generated/hgrp_material_params.wgsl',
);

export const HGRP_VFX_PARAMS_LAYOUT = layoutParams(
  HGRP_VFX_PARAMS,
  'generated/hgrp_vfx_params.wgsl',
);

const LAYOUT_BY_STRUCT = new Map<HGRPParamsStruct, HGRPParamsLayout>([
  [HGRP_MATERIAL_PARAMS, HGRP_MATERIAL_PARAMS_LAYOUT],
  [HGRP_VFX_PARAMS, HGRP_VFX_PARAMS_LAYOUT],
]);

export const HGRP_PARAMS_LAYOUTS: readonly HGRPParamsLayout[] = Array.from(
  LAYOUT_BY_STRUCT.values(),
);

export function hgrpParamsLayoutForVariant(variant: HGRPShaderVariant): HGRPParamsLayout {
  return LAYOUT_BY_STRUCT.get(hgrpParamsStructForVariant(variant))!;
}

// Pack a material's params into the struct's byte layout (the buffer the shader reads at
// group 2 binding 0). Bytes not covered by a field are alignment padding and stay zero.
export function packHGRPParams(
  layout: HGRPParamsLayout,
  material: HGRPMaterialDescriptor,
): Float32Array {
  const out = new Float32Array(layout.byteSize / 4);
  for (const field of layout.fields) {
    const value = field.pack ? field.pack(material) : readHGRPParam(material, field.params[0]);
    const index = field.offset / 4;
    if (typeof value === 'number') {
      out[index] = value;
    } else {
      out.set(value, index);
    }
  }
  return out;
}
