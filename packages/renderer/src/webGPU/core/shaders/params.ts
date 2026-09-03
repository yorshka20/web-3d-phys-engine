import { ShaderParamDefinition } from './types/shader';

export type ShaderParamType = 'f32' | 'i32' | 'bool' | 'vec2' | 'vec3' | 'vec4';

// WGSL host-shareable layout, in bytes. `bool` is not host-shareable, so it is declared as i32
// and written as 0/1.
const PACKABLE: Record<
  ShaderParamType,
  { align: number; size: number; components: number; wgsl: string }
> = {
  f32: { align: 4, size: 4, components: 1, wgsl: 'f32' },
  i32: { align: 4, size: 4, components: 1, wgsl: 'i32' },
  bool: { align: 4, size: 4, components: 1, wgsl: 'i32' },
  vec2: { align: 8, size: 8, components: 2, wgsl: 'vec2<f32>' },
  vec3: { align: 16, size: 12, components: 3, wgsl: 'vec3<f32>' },
  vec4: { align: 16, size: 16, components: 4, wgsl: 'vec4<f32>' },
};

// Group 3 is the regular material family's material group; binding 0 is MaterialUniforms.
export const SHADER_PARAMS_GROUP = 3;
export const SHADER_PARAMS_BINDING = 1;

// A struct in the uniform address space aligns to 16, and a uniform binding may not be empty:
// the binding exists for every regular material, whether its shader declares params or not.
const UNIFORM_STRUCT_ALIGN = 16;

export interface ShaderParamsField {
  name: string;
  type: ShaderParamType;
  byteOffset: number;
}

export interface ShaderParamsLayout {
  fields: ShaderParamsField[];
  byteSize: number;
}

/**
 * Byte layout of a shader module's `runtimeParams` block.
 *
 * The declaration is the single source of truth for three derived things that must agree: this
 * layout, the WGSL struct emitted next to it, and the CPU packer below. Fields keep declaration
 * order, so adding one in the middle shifts the ones after it — which is invisible, because
 * nothing writes the buffer by hand.
 */
export function shaderParamsLayout(
  params: Record<string, ShaderParamDefinition> | undefined,
): ShaderParamsLayout {
  const fields: ShaderParamsField[] = [];
  let offset = 0;

  for (const [name, definition] of Object.entries(params ?? {})) {
    const spec = PACKABLE[definition.type as ShaderParamType];
    if (!spec) {
      throw new Error(
        `Shader param '${name}' declares unsupported type '${definition.type}'; ` +
          `supported: ${Object.keys(PACKABLE).join(', ')}`,
      );
    }
    offset = alignTo(offset, spec.align);
    fields.push({ name, type: definition.type as ShaderParamType, byteOffset: offset });
    offset += spec.size;
  }

  return {
    fields,
    byteSize: Math.max(alignTo(offset, UNIFORM_STRUCT_ALIGN), UNIFORM_STRUCT_ALIGN),
  };
}

/**
 * Pack a material's `shaderParams` overrides over the declared defaults.
 */
export function packShaderParams(
  layout: ShaderParamsLayout,
  params: Record<string, ShaderParamDefinition>,
  overrides: Record<string, unknown> = {},
): ArrayBuffer {
  const buffer = new ArrayBuffer(layout.byteSize);
  const floats = new Float32Array(buffer);
  const ints = new Int32Array(buffer);

  for (const field of layout.fields) {
    const value = overrides[field.name] ?? params[field.name].defaultValue;
    const index = field.byteOffset / 4;

    if (field.type === 'bool') {
      ints[index] = value ? 1 : 0;
      continue;
    }
    if (field.type === 'i32') {
      ints[index] = Number(value) | 0;
      continue;
    }

    const components = Array.isArray(value) ? value : [Number(value)];
    for (let i = 0; i < PACKABLE[field.type].components; i++) {
      floats[index + i] = Number(components[i] ?? 0);
    }
  }

  return buffer;
}

/**
 * The WGSL the shader sees: `shader_params.<declared name>`. Field names are emitted verbatim,
 * so the declaration key is the name in both languages and there is no mapping to get wrong.
 */
export function shaderParamsWGSL(layout: ShaderParamsLayout): string {
  if (layout.fields.length === 0) {
    return '';
  }

  const members = layout.fields
    .map((field) => `    ${field.name}: ${PACKABLE[field.type].wgsl},`)
    .join('\n');

  return [
    'struct ShaderParams {',
    members,
    '}',
    '',
    `@group(${SHADER_PARAMS_GROUP}) @binding(${SHADER_PARAMS_BINDING}) var<uniform> shader_params: ShaderParams;`,
  ].join('\n');
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}
