import type { HGRPMaterialDescriptor, HGRPShaderVariant } from './descriptor';
import type { HGRPSubsystemId } from './subsystems';

// Vocabulary of the HGRP material contract (learnings shader-feature-gating.md): a PARAM is one
// preset key (HGRP property name verbatim) with the value the binder falls back to when a
// preset omits it; a FIELD is one member of a uniform struct, sourced from one param or
// composed from several by a pack function; a STRUCT is one uniform block shared by the
// variants whose parameter vocabulary it covers.

export type HGRPVec4 = readonly [number, number, number, number];

export interface GuiRange {
  min: number;
  max: number;
  step?: number;
}

export interface HGRPFloatParam {
  kind: 'float';
  key: string;
  default: number;
  gui?: GuiRange;
}

// How a vec4 param's stored value reaches the shader. Unity, in a linear-color-space project,
// uploads a `Color` property sRGB-decoded (the inspector and the serialized material hold the
// sRGB value), an `[HDR]` color as stored (already linear), and an `[HDR] [Gamma]` color decoded
// again — the HGRP shaders tag their VFX colors so on purpose. The GUI pickers edit the stored
// (sRGB) value, so a picked color means what it would mean in the Unity inspector. Vectors that
// merely ride in the color table (_ST tiling, UV speeds and weights) are linear.
export type HGRPColorSpace = 'srgb' | 'linear';

export interface HGRPColorParam {
  kind: 'color';
  key: string;
  default: HGRPVec4;
  // Color pickers cannot express HDR (>1) values; those params stay preset-driven.
  gui?: boolean;
  space: HGRPColorSpace;
}

export type HGRPParam = HGRPFloatParam | HGRPColorParam;

export type HGRPUniformFieldType = 'f32' | 'vec2' | 'vec4';

export interface HGRPUniformField {
  name: string; // WGSL member name
  type: HGRPUniformFieldType;
  subsystem: HGRPSubsystemId;
  comment?: string;
  // Preset keys the field reads. Without `pack`, params[0] is the value (float -> f32,
  // color -> vec4); with `pack`, the list is the GUI/ledger record of what the function reads.
  params: readonly HGRPParam[];
  pack?: (material: HGRPMaterialDescriptor) => number | readonly number[];
}

export interface HGRPParamsStruct {
  structName: string; // WGSL struct name
  uniformVar: string; // WGSL module-scope variable the shaders read through
  variants: readonly HGRPShaderVariant[];
  header: string; // leading comment of the generated WGSL declaration
  fields: readonly HGRPUniformField[];
}

export const WHITE: HGRPVec4 = [1, 1, 1, 1];
export const BLACK_OPAQUE: HGRPVec4 = [0, 0, 0, 1];
export const ZERO4: HGRPVec4 = [0, 0, 0, 0];
export const TOGGLE: GuiRange = { min: 0, max: 1, step: 1 };

export function float(key: string, def: number, gui?: GuiRange): HGRPFloatParam {
  return { kind: 'float', key, default: def, gui };
}

export function color(
  key: string,
  def: HGRPVec4,
  gui = false,
  space: HGRPColorSpace = 'srgb',
): HGRPColorParam {
  return { kind: 'color', key, default: def, gui, space };
}

// A vec4 that is not a color: tiling / offset, UV speeds and weights — stored and read linear.
export function vector(key: string, def: HGRPVec4): HGRPColorParam {
  return color(key, def, false, 'linear');
}

// Unity's Mathf.GammaToLinearSpace: the sRGB curve below 1 and pow 2.2 above it, which is how
// an HDR `[Gamma]` color such as Laevatian's ember tint (8.47) is decoded.
export function unityGammaToLinear(value: number): number {
  if (value <= 0.04045) {
    return value / 12.92;
  }
  if (value < 1) {
    return Math.pow((value + 0.055) / 1.055, 2.4);
  }
  return Math.pow(value, 2.2);
}

// The value the shader reads for a vec4 param: decoded per its color space; alpha is never
// decoded (Unity leaves it alone too).
export function hgrpColorParamValue(param: HGRPColorParam, stored: HGRPVec4): HGRPVec4 {
  if (param.space === 'linear') {
    return stored;
  }
  return [
    unityGammaToLinear(stored[0]),
    unityGammaToLinear(stored[1]),
    unityGammaToLinear(stored[2]),
    stored[3],
  ];
}

export function f32(
  name: string,
  subsystem: HGRPSubsystemId,
  param: HGRPFloatParam,
  comment?: string,
): HGRPUniformField {
  return { name, type: 'f32', subsystem, params: [param], comment };
}

export function vec4(
  name: string,
  subsystem: HGRPSubsystemId,
  param: HGRPColorParam,
  comment?: string,
): HGRPUniformField {
  return { name, type: 'vec4', subsystem, params: [param], comment };
}

export function readHGRPParam(
  material: HGRPMaterialDescriptor,
  param: HGRPParam,
): number | HGRPVec4 {
  return param.kind === 'float'
    ? (material.floats[param.key] ?? param.default)
    : hgrpColorParamValue(param, material.colors[param.key] ?? param.default);
}
