import { HGRP_PARAMS_STRUCTS } from './params';
import { HGRP_SUBSYSTEMS, HGRPSubsystemId } from './subsystems';
import {
  HGRP_TEXTURE_SLOTS,
  HGRP_TEXTURE_SLOTS_BY_VARIANT,
  HGRP_UNIMPLEMENTED_SLOTS,
} from './textures';

// Self-check of the contract tables. They must agree with each other, or a typo in one of
// them would surface only as a texture silently resolving to white or a gate no permutation
// can read — so the check runs at module load (index.ts) and throws.

export function validateHGRPContract(): void {
  const subsystemIds = new Set(HGRP_SUBSYSTEMS.map((subsystem) => subsystem.id));
  const fieldParamKeys = new Set<string>();
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
  }
  for (const slot of Object.keys(HGRP_TEXTURE_SLOTS)) {
    if (!claimedSlots.has(slot)) {
      throw new Error(`HGRP contract: slot ${slot} belongs to no subsystem`);
    }
  }
  // A variant override may share a slot with another subsystem, but only a registered one
  // that the variant binds, and only on a subsystem with a hook to read it through.
  for (const subsystem of HGRP_SUBSYSTEMS) {
    for (const [variant, override] of Object.entries(subsystem.variants ?? {})) {
      const bound =
        HGRP_TEXTURE_SLOTS_BY_VARIANT[variant as keyof typeof HGRP_TEXTURE_SLOTS_BY_VARIANT];
      for (const slot of override.textures) {
        if (!bound.includes(slot)) {
          throw new Error(
            `HGRP contract: ${subsystem.id} on ${variant} reads ${slot}, which the variant does not bind`,
          );
        }
      }
      if (override.include && !subsystem.wgsl) {
        throw new Error(`HGRP contract: ${subsystem.id} has a variant include but no hook`);
      }
    }
  }
  for (const [variant, slots] of Object.entries(HGRP_TEXTURE_SLOTS_BY_VARIANT)) {
    for (const slot of slots) {
      if (!(slot in HGRP_TEXTURE_SLOTS)) {
        throw new Error(`HGRP contract: variant ${variant} binds unregistered slot ${slot}`);
      }
    }
    if (new Set(slots).size !== slots.length) {
      throw new Error(`HGRP contract: variant ${variant} lists a slot twice`);
    }
  }
  for (const [variant, pending] of Object.entries(HGRP_UNIMPLEMENTED_SLOTS)) {
    const bound =
      HGRP_TEXTURE_SLOTS_BY_VARIANT[variant as keyof typeof HGRP_TEXTURE_SLOTS_BY_VARIANT];
    for (const slot of Object.keys(pending ?? {})) {
      if (!bound.includes(slot)) {
        throw new Error(
          `HGRP contract: ${variant} lists ${slot} as unimplemented but does not bind it`,
        );
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
      field.params.forEach((param) => fieldParamKeys.add(param.key));
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

  // Gate tiers: a static gate is a compile-time decision and must not also be a uniform field
  // (two copies of one switch); a numeric gate is read by the shader, so it must be one.
  const hooks = new Set<string>();
  for (const subsystem of HGRP_SUBSYSTEMS) {
    if ((subsystem.gate === undefined) !== (subsystem.tier === undefined)) {
      throw new Error(`HGRP contract: subsystem ${subsystem.id} needs both a gate and a tier`);
    }
    if (subsystem.tier === 'static' && fieldParamKeys.has(subsystem.gate!)) {
      throw new Error(
        `HGRP contract: static gate ${subsystem.gate} of ${subsystem.id} is also a uniform field`,
      );
    }
    if (subsystem.tier === 'numeric' && !fieldParamKeys.has(subsystem.gate!)) {
      throw new Error(
        `HGRP contract: numeric gate ${subsystem.gate} of ${subsystem.id} is not a uniform field`,
      );
    }
    if (subsystem.drawList && subsystem.tier !== 'static') {
      throw new Error(`HGRP contract: only a static gate routes draw lists (${subsystem.id})`);
    }
    if (subsystem.wgsl) {
      if (subsystem.tier !== 'static') {
        throw new Error(`HGRP contract: only a static subsystem has a WGSL hook (${subsystem.id})`);
      }
      if (hooks.has(subsystem.wgsl.fn)) {
        throw new Error(`HGRP contract: hook ${subsystem.wgsl.fn} declared twice`);
      }
      hooks.add(subsystem.wgsl.fn);
    }
  }
}
