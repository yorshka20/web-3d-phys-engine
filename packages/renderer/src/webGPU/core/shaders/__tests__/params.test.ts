import { describe, expect, it } from 'vitest';
import { packShaderParams, shaderParamsLayout, shaderParamsWGSL } from '../params';
import { ShaderParamDefinition } from '../types/shader';

const f32 = (defaultValue: number): ShaderParamDefinition => ({ type: 'f32', defaultValue });

describe('shaderParamsLayout', () => {
  it('gives an empty declaration a minimum-size buffer and no WGSL', () => {
    const layout = shaderParamsLayout(undefined);
    expect(layout.fields).toEqual([]);
    expect(layout.byteSize).toBe(16);
    expect(shaderParamsWGSL(layout)).toBe('');
  });

  it('aligns each field by its WGSL alignment and rounds the struct to 16', () => {
    const layout = shaderParamsLayout({
      scale: f32(1),
      tint: { type: 'vec3', defaultValue: [1, 0, 0] },
      enabled: { type: 'bool', defaultValue: true },
      offset: { type: 'vec2', defaultValue: [0, 0] },
    });

    expect(layout.fields.map((field) => [field.name, field.byteOffset])).toEqual([
      ['scale', 0],
      // vec3 aligns to 16, so the three bytes after `scale` are padding
      ['tint', 16],
      ['enabled', 28],
      ['offset', 32],
    ]);
    expect(layout.byteSize).toBe(48);
  });

  it('rejects a type it cannot pack rather than emitting a struct the CPU disagrees with', () => {
    expect(() => shaderParamsLayout({ transform: { type: 'mat4', defaultValue: [] } })).toThrow(
      /unsupported type 'mat4'/,
    );
  });
});

describe('packShaderParams', () => {
  const declared: Record<string, ShaderParamDefinition> = {
    cellSize: f32(1),
    tint: { type: 'vec3', defaultValue: [1, 0.5, 0.25] },
    enabled: { type: 'bool', defaultValue: false },
    count: { type: 'i32', defaultValue: 3 },
  };
  const layout = shaderParamsLayout(declared);

  it('falls back to the declared defaults', () => {
    const floats = new Float32Array(packShaderParams(layout, declared));
    const ints = new Int32Array(floats.buffer);
    expect(floats[0]).toBe(1);
    expect([...floats.slice(4, 7)]).toEqual([1, 0.5, 0.25]);
    expect(ints[7]).toBe(0);
    expect(ints[8]).toBe(3);
  });

  it('takes the material overrides on top, including a zero', () => {
    const buffer = packShaderParams(layout, declared, {
      cellSize: 0,
      tint: [0, 1, 0],
      enabled: true,
    });
    const floats = new Float32Array(buffer);
    const ints = new Int32Array(buffer);
    expect(floats[0]).toBe(0);
    expect([...floats.slice(4, 7)]).toEqual([0, 1, 0]);
    expect(ints[7]).toBe(1);
    // Untouched fields keep their default
    expect(ints[8]).toBe(3);
  });
});

describe('shaderParamsWGSL', () => {
  it('declares the struct and its binding with the names the declaration used', () => {
    const wgsl = shaderParamsWGSL(shaderParamsLayout({ cellSize: f32(1) }));
    expect(wgsl).toContain('struct ShaderParams {');
    expect(wgsl).toContain('cellSize: f32,');
    expect(wgsl).toContain('@group(3) @binding(1) var<uniform> shader_params: ShaderParams;');
  });

  it('declares a bool as i32, which is what the packer writes', () => {
    const wgsl = shaderParamsWGSL(
      shaderParamsLayout({ enabled: { type: 'bool', defaultValue: true } }),
    );
    expect(wgsl).toContain('enabled: i32,');
  });
});
