import { HGRP_PARAMS_STRUCTS } from './params';
import { HGRP_SUBSYSTEMS, HGRPSubsystemId } from './subsystems';
import {
  HGRP_TEXTURE_SLOTS,
  HGRP_TEXTURE_SLOTS_BY_VARIANT,
  HGRP_TEXTURE_SLOTS_COMMON,
} from './textures';

// Self-check of the contract tables. They must agree with each other, or a typo in one of
// them would surface only as a texture silently resolving to white or a gate no permutation
// can read — so the check runs at module load (index.ts) and throws.

function subsystemHasFields(id: HGRPSubsystemId): boolean {
  return HGRP_PARAMS_STRUCTS.some((struct) => struct.fields.some((f) => f.subsystem === id));
}

export function validateHGRPContract(): void {
  const subsystemIds = new Set(HGRP_SUBSYSTEMS.map((subsystem) => subsystem.id));
  const declaredKeys = new Set<string>();
  const claimedSlots = new Map<string, HGRPSubsystemId>();

  for (const subsystem of HGRP_SUBSYSTEMS) {
    for (const slot of subsystem.textures ?? []) {
      if (!(slot in HGRP_TEXTURE_SLOTS)) {
        throw new Error(
          `HGRP contract: subsystem ${subsystem.id} claims unregistered slot ${slot}`,
        );
      }
      const owner = claimedSlots.get(slot);
      if (owner) {
        throw new Error(`HGRP contract: slot ${slot} claimed by both ${owner} and ${subsystem.id}`);
      }
      claimedSlots.set(slot, subsystem.id);
    }
    subsystem.listParams?.forEach((param) => declaredKeys.add(param.key));
  }
  for (const slot of Object.keys(HGRP_TEXTURE_SLOTS)) {
    if (!claimedSlots.has(slot)) {
      throw new Error(`HGRP contract: slot ${slot} belongs to no subsystem`);
    }
  }
  for (const [variant, slots] of Object.entries(HGRP_TEXTURE_SLOTS_BY_VARIANT)) {
    for (const slot of [...HGRP_TEXTURE_SLOTS_COMMON, ...slots]) {
      if (!(slot in HGRP_TEXTURE_SLOTS)) {
        throw new Error(`HGRP contract: variant ${variant} binds unregistered slot ${slot}`);
      }
    }
  }

  for (const struct of HGRP_PARAMS_STRUCTS) {
    for (const field of struct.fields) {
      if (!subsystemIds.has(field.subsystem)) {
        throw new Error(
          `HGRP contract: field ${field.name} names unknown subsystem ${field.subsystem}`,
        );
      }
      field.params.forEach((param) => declaredKeys.add(param.key));
      if (field.pack) {
        continue;
      }
      const source = field.params[0];
      const expectedKind = field.type === 'f32' ? 'float' : field.type === 'vec4' ? 'color' : null;
      if (!source || source.kind !== expectedKind) {
        throw new Error(
          `HGRP contract: field ${field.name} (${field.type}) needs a ${expectedKind ?? 'pack'} source`,
        );
      }
    }
  }

  // A subsystem with no fields yet (the dormant ones) may name a gate nobody declares.
  for (const subsystem of HGRP_SUBSYSTEMS) {
    if (subsystem.gate && !declaredKeys.has(subsystem.gate) && subsystemHasFields(subsystem.id)) {
      throw new Error(
        `HGRP contract: gate ${subsystem.gate} of ${subsystem.id} is not a declared param`,
      );
    }
  }
}
