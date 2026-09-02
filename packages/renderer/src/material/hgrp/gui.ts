import { HGRP_PARAMS_STRUCTS } from './params';
import { HGRPParam, HGRPVec4 } from './primitives';
import { HGRP_SUBSYSTEMS } from './subsystems';

// Calibration GUI schema, derived from the params that declare a `gui` range. The shading GUI
// generates its widgets from these and mutates the live descriptors in place — the binder
// re-packs the material uniform from the descriptor every frame, so edits take effect without
// extra plumbing. A default is the value the binder packs when a preset omits the key, so a
// widget shows what the shader is already seeing.

export interface HGRPTunableFloatDef {
  key: string;
  default: number;
  min: number;
  max: number;
  step?: number;
}

export interface HGRPTunableColorDef {
  key: string;
  default: HGRPVec4;
}

export const HGRP_SHADING_SCHEMA_VERSION = 1;

// Every param in GUI order: subsystem declaration order, then uniform fields in struct order,
// then the subsystem's draw-list params. A key appears once even if several fields read it.
function paramsInGuiOrder(): HGRPParam[] {
  const seen = new Set<string>();
  const ordered: HGRPParam[] = [];
  const add = (param: HGRPParam) => {
    if (!seen.has(param.key)) {
      seen.add(param.key);
      ordered.push(param);
    }
  };
  for (const subsystem of HGRP_SUBSYSTEMS) {
    for (const struct of HGRP_PARAMS_STRUCTS) {
      for (const field of struct.fields) {
        if (field.subsystem === subsystem.id) {
          field.params.forEach(add);
        }
      }
    }
    subsystem.listParams?.forEach(add);
  }
  return ordered;
}

export const HGRP_TUNABLE_FLOATS: readonly HGRPTunableFloatDef[] = paramsInGuiOrder().flatMap(
  (param) =>
    param.kind === 'float' && param.gui
      ? [{ key: param.key, default: param.default, ...param.gui }]
      : [],
);

export const HGRP_TUNABLE_COLORS: readonly HGRPTunableColorDef[] = paramsInGuiOrder().flatMap(
  (param) =>
    param.kind === 'color' && param.gui ? [{ key: param.key, default: param.default }] : [],
);
