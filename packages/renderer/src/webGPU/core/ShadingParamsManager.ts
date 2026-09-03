import { BufferManager } from './BufferManager';
import { ServiceTokens } from './decorators/DIContainer';
import { Inject, Injectable } from './decorators/inject';
import { BufferType } from './types';

export interface ShadingParamDef {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step?: number;
}

export const PMX_SHADING_SCHEMA_VERSION = 1;

/**
 * Single source of truth for the tunable PMX shading parameters: the GUI panel is generated
 * from this list, presets are keyed by `key`, and the uniform buffer is packed in list order —
 * so the order here must match the field order of `PMXShadingParams` in core/uniforms.wgsl.
 */
export const PMX_SHADING_PARAM_SCHEMA: readonly ShadingParamDef[] = [
  { key: 'lightDirX', label: 'Light Dir X', default: 0.5, min: -1, max: 1, step: 0.01 },
  { key: 'lightDirY', label: 'Light Dir Y', default: 0.8, min: -1, max: 1, step: 0.01 },
  { key: 'lightDirZ', label: 'Light Dir Z', default: 0.3, min: -1, max: 1, step: 0.01 },
  { key: 'ambientStrength', label: 'Ambient', default: 1.0, min: 0, max: 2, step: 0.01 },
  { key: 'emissionIntensity', label: 'Emission', default: 2.0, min: 0, max: 4, step: 0.01 },
  { key: 'diffuseFloor', label: 'Diffuse Floor', default: 0.3, min: 0, max: 1, step: 0.01 },
  { key: 'diffuseGain', label: 'Diffuse Gain', default: 1.2, min: 0, max: 3, step: 0.01 },
  { key: 'minBrightness', label: 'Min Brightness', default: 0.4, min: 0, max: 1, step: 0.01 },
  { key: 'specularScaleDark', label: 'Spec (dark base)', default: 0.3, min: 0, max: 1, step: 0.01 },
  {
    key: 'specularScaleBright',
    label: 'Spec (bright base)',
    default: 0.1,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'envReflectionStrength',
    label: 'Env Reflection',
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: 'normalStrength', label: 'Normal Strength', default: 0.7, min: 0, max: 1, step: 0.01 },
  {
    key: 'normalThreshold',
    label: 'Normal Threshold',
    default: 0.15,
    min: 0,
    max: 0.5,
    step: 0.01,
  },
  { key: 'saturation', label: 'Saturation', default: 1.0, min: 0, max: 2, step: 0.01 },
];

// Uniform structs require 16-byte-multiple sizes.
const FLOAT_COUNT = Math.ceil(PMX_SHADING_PARAM_SCHEMA.length / 4) * 4;

/**
 * Owns the shared PMX shading-parameter uniform buffer (group 2, binding 17 — one buffer
 * referenced by every PMX material bind group). CPU-side values accept writes before the GPU
 * buffer exists; the buffer picks them up on creation.
 */
@Injectable(ServiceTokens.SHADING_PARAMS_MANAGER)
export class ShadingParamsManager {
  @Inject(ServiceTokens.BUFFER_MANAGER)
  private accessor bufferManager!: BufferManager;

  private values = new Float32Array(FLOAT_COUNT);
  private indexByKey = new Map<string, number>();
  private buffer: GPUBuffer | null = null;

  constructor() {
    PMX_SHADING_PARAM_SCHEMA.forEach((def, i) => {
      this.indexByKey.set(def.key, i);
      this.values[i] = def.default;
    });
  }

  getBuffer(): GPUBuffer {
    if (!this.buffer) {
      this.buffer = this.bufferManager.createCustomBuffer('pmx_shading_params', {
        type: BufferType.UNIFORM,
        size: FLOAT_COUNT * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.upload();
    }
    return this.buffer;
  }

  /**
   * Set one parameter by schema key.
   * @returns false when the key is not in the schema
   */
  setParam(key: string, value: number): boolean {
    const index = this.indexByKey.get(key);
    if (index === undefined) {
      return false;
    }
    this.values[index] = value;
    this.upload();
    return true;
  }

  /**
   * Apply a partial value set (preset / import).
   * @returns the keys that are not in the schema (tolerant merge: they are skipped)
   */
  setParams(partial: Record<string, number>): string[] {
    const unknownKeys: string[] = [];
    for (const [key, value] of Object.entries(partial)) {
      const index = this.indexByKey.get(key);
      if (index === undefined) {
        unknownKeys.push(key);
        continue;
      }
      this.values[index] = value;
    }
    this.upload();
    return unknownKeys;
  }

  getValues(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, index] of this.indexByKey) {
      result[key] = this.values[index];
    }
    return result;
  }

  private upload(): void {
    if (this.buffer) {
      this.bufferManager.updateBuffer(this.buffer, this.values.buffer as ArrayBuffer);
    }
  }
}
