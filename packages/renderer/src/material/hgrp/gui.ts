import type { HGRPMaterialDescriptor } from './descriptor';
import { HGRP_PARAMS_STRUCTS } from './params';
import { hgrpSubsystemAppliesTo, hgrpSubsystemMissingTextures } from './permutation';
import { float, HGRPParam, HGRPVec4, TOGGLE } from './primitives';
import { HGRP_SUBSYSTEMS, hgrpSubsystem, HGRPSubsystem, HGRPSubsystemId } from './subsystems';

// Calibration GUI schema, derived from the params that declare a `gui` range. The shading GUI
// generates its widgets from these and mutates the live descriptors in place — the binder
// re-packs the material uniform from the descriptor every frame, so numeric edits take effect
// without extra plumbing; a static gate additionally re-resolves the material's permutation
// (descriptor.ts hgrpRefreshPermutation), which lands as a new shader module and pipeline. A
// default is the value the binder packs when a preset omits the key, so a widget shows what the
// shader is already seeing.

interface HGRPTunableDef {
  key: string;
  // The feature the param belongs to: the field table's tag, or a static gate's own subsystem.
  // What decides whether a given material shows the widget (hgrpMaterialTunables).
  subsystem: HGRPSubsystemId;
  // The subsystem's master switch rather than one of its parameters.
  gate?: true;
}

export interface HGRPTunableFloatDef extends HGRPTunableDef {
  default: number;
  min: number;
  max: number;
  step?: number;
}

export interface HGRPTunableColorDef extends HGRPTunableDef {
  default: HGRPVec4;
}

export const HGRP_SHADING_SCHEMA_VERSION = 1;

interface HGRPGuiParam {
  param: HGRPParam;
  subsystem: HGRPSubsystemId;
  gate: boolean;
}

// Every param in GUI order: subsystem declaration order; within a subsystem its static gate
// (a toggle that is not a uniform field, shown only when a hook or the draw lists consume it),
// then its uniform fields in struct order. A key appears once even if several fields read it.
function paramsInGuiOrder(): HGRPGuiParam[] {
  const seen = new Set<string>();
  const ordered: HGRPGuiParam[] = [];
  const add = (param: HGRPParam, subsystem: HGRPSubsystem) => {
    if (!seen.has(param.key)) {
      seen.add(param.key);
      ordered.push({ param, subsystem: subsystem.id, gate: param.key === subsystem.gate });
    }
  };
  for (const subsystem of HGRP_SUBSYSTEMS) {
    if (subsystem.gate && subsystem.tier === 'static' && (subsystem.wgsl || subsystem.drawList)) {
      add(float(subsystem.gate, 0, TOGGLE), subsystem);
    }
    for (const struct of HGRP_PARAMS_STRUCTS) {
      for (const field of struct.fields) {
        if (field.subsystem === subsystem.id) {
          for (const param of field.params) {
            add(param, subsystem);
          }
        }
      }
    }
  }
  return ordered;
}

function tunableDef({ param, subsystem, gate }: HGRPGuiParam): HGRPTunableDef {
  return gate ? { key: param.key, subsystem, gate: true } : { key: param.key, subsystem };
}

export const HGRP_TUNABLE_FLOATS: readonly HGRPTunableFloatDef[] = paramsInGuiOrder().flatMap(
  (entry) =>
    entry.param.kind === 'float' && entry.param.gui
      ? [{ ...tunableDef(entry), default: entry.param.default, ...entry.param.gui }]
      : [],
);

export const HGRP_TUNABLE_COLORS: readonly HGRPTunableColorDef[] = paramsInGuiOrder().flatMap(
  (entry) =>
    entry.param.kind === 'color' && entry.param.gui
      ? [{ ...tunableDef(entry), default: entry.param.default }]
      : [],
);

type HGRPTunableMaterial = Pick<
  HGRPMaterialDescriptor,
  'variant' | 'floats' | 'colors' | 'textures' | 'permutation'
>;

// Whether the subsystem shades the material right now. Gateless subsystems always do. A static
// one does when the material's permutation carries it — which also settles a variant it does
// not apply to, whatever the preset says of its gate. A static gate that never enters a
// permutation (draw-list only, the outline) and a numeric gate are read off the preset value.
function subsystemOn(subsystem: HGRPSubsystem, material: HGRPTunableMaterial): boolean {
  if (!subsystem.gate) {
    return true;
  }
  if (subsystem.tier === 'static' && !subsystem.drawList) {
    return material.permutation.enabled.includes(subsystem.id);
  }
  return material.floats[subsystem.gate] === 1;
}

// Whether flipping the subsystem's gate can change the material. A static gate needs the
// subsystem to apply to the variant and every texture it samples to be present or have a
// stand-in — the permutation drops it otherwise, and the toggle would be dead. A draw-list
// gate and a numeric gate always can.
function gateReachable(subsystem: HGRPSubsystem, material: HGRPTunableMaterial): boolean {
  if (subsystem.tier !== 'static' || subsystem.drawList) {
    return true;
  }
  return (
    hgrpSubsystemAppliesTo(subsystem, material.variant) &&
    hgrpSubsystemMissingTextures(subsystem, material.variant, material.textures).length === 0
  );
}

export interface HGRPMaterialTunables {
  floats: HGRPTunableFloatDef[];
  colors: HGRPTunableColorDef[];
}

// The widgets one material gets: the params its shader reads. A key has to be in the preset —
// the binder falls back to a default for an absent key, a slider for it would calibrate a value
// the material never carries, and the VFX variant's vocabulary is disjoint from the CharacterNPR
// family's. A subsystem's params show only while it is on for this material: the rip serializes
// every property of the shader, fur lengths on materials without fur included, so the key set
// alone would give every cloth material a full set of fur sliders. Its gate shows whenever
// flipping it can take effect, so a feature the rip left off can still be switched on.
export function hgrpMaterialTunables(material: HGRPTunableMaterial): HGRPMaterialTunables {
  const shown = (def: HGRPTunableDef, present: boolean): boolean => {
    if (!present) {
      return false;
    }
    const subsystem = hgrpSubsystem(def.subsystem);
    return def.gate ? gateReachable(subsystem, material) : subsystemOn(subsystem, material);
  };
  return {
    floats: HGRP_TUNABLE_FLOATS.filter((def) => shown(def, def.key in material.floats)),
    colors: HGRP_TUNABLE_COLORS.filter((def) => shown(def, def.key in material.colors)),
  };
}
