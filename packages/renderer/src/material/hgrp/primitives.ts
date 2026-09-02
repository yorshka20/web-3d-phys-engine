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

export interface HGRPColorParam {
  kind: 'color';
  key: string;
  default: HGRPVec4;
  // Color pickers cannot express HDR (>1) values; those params stay preset-driven.
  gui?: boolean;
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

export function color(key: string, def: HGRPVec4, gui = false): HGRPColorParam {
  return { kind: 'color', key, default: def, gui };
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
    : (material.colors[param.key] ?? param.default);
}
