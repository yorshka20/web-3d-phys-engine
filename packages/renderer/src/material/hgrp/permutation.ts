import type { HGRPShaderVariant } from './descriptor';
import {
  HGRP_SUBSYSTEMS,
  HGRPSubsystem,
  HGRPSubsystemId,
  hgrpSubsystemTextures,
} from './subsystems';
import { HGRP_TEXTURE_SLOTS_BY_VARIANT } from './textures';

// A PERMUTATION is a variant plus the static subsystems a material enables. It is resolved once
// from the preset (descriptor.ts) and serialized into the material's customShaderId, which is
// how it reaches the semantic pipeline key, the pipeline layout and the shader module factory:
//
//   hgrp_skin_shader+ramp+shadowLut+normal
//
// Base id = the variant's shader id; suffix = enabled subsystem ids in declaration order. The
// id is canonical (one spelling per permutation) so equal permutations share one compiled
// module and one pipeline; parsing rejects any other spelling. Permutations are never
// enumerated up front — only the ones the loaded materials resolve to exist (Unity's
// shader_feature, never multi_compile; learnings shader-feature-gating.md §2.1).

export const HGRP_SHADER_ID_BY_VARIANT = {
  CharacterNPR: 'hgrp_npr_shader',
  CharacterNPR_Skin: 'hgrp_skin_shader',
  CharacterNPR_Hair: 'hgrp_hair_shader',
  CharacterNPR_Eye: 'hgrp_eye_shader',
  CharacterNPR_VFX: 'hgrp_vfx_shader',
} as const satisfies Record<HGRPShaderVariant, string>;

// Base shader id of a variant (the all-off permutation).
export type HGRPShaderId = (typeof HGRP_SHADER_ID_BY_VARIANT)[HGRPShaderVariant];

// Any material permutation id: a base id, optionally suffixed with enabled subsystems.
export type HGRPPermutationShaderId = HGRPShaderId | `${HGRPShaderId}+${string}`;

const SUBSYSTEM_SEPARATOR = '+';

export interface HGRPPermutation {
  variant: HGRPShaderVariant;
  // Enabled static subsystems, in HGRP_SUBSYSTEMS declaration order.
  enabled: readonly HGRPSubsystemId[];
}

export function hgrpVariantForShaderId(shaderId: string): HGRPShaderVariant | undefined {
  return (Object.keys(HGRP_SHADER_ID_BY_VARIANT) as HGRPShaderVariant[]).find(
    (variant) => HGRP_SHADER_ID_BY_VARIANT[variant] === shaderId,
  );
}

// The whole family shares the glTF-converted vertex layout; pipeline code gates the 26-float
// vertex buffer layout on this predicate instead of enumerating variant shader ids.
export function isHGRPShaderId(shaderId: string | undefined): boolean {
  return !!shaderId && shaderId.startsWith('hgrp_');
}

export const HGRP_STATIC_SUBSYSTEMS: readonly HGRPSubsystem[] = HGRP_SUBSYSTEMS.filter(
  (subsystem) => subsystem.tier === 'static',
);

// A static subsystem applies to a variant when the variant's slot table binds every texture it
// consumes (a hook-only subsystem applies everywhere). A subsystem whose slot no variant table
// lists — outline, whose mask lives in the outline pass's private layout — applies nowhere and
// therefore never enters a permutation: it only routes draw lists.
export function hgrpSubsystemAppliesTo(
  subsystem: HGRPSubsystem,
  variant: HGRPShaderVariant,
): boolean {
  if (subsystem.tier !== 'static') {
    return false;
  }
  const slots = HGRP_TEXTURE_SLOTS_BY_VARIANT[variant];
  return hgrpSubsystemTextures(subsystem, variant).every((slot) => slots.includes(slot));
}

export function hgrpApplicableSubsystems(variant: HGRPShaderVariant): HGRPSubsystem[] {
  return HGRP_STATIC_SUBSYSTEMS.filter((subsystem) => hgrpSubsystemAppliesTo(subsystem, variant));
}

// A gate that is on while the preset lacks a texture the subsystem samples. The subsystem stays
// off — sampling a placeholder would silently shade with white — and the caller reports it, so
// the gap is visible instead of being absorbed by a default texture.
export interface HGRPDroppedSubsystem {
  subsystem: HGRPSubsystemId;
  gate: string;
  missing: string[];
}

export interface HGRPPermutationResolution {
  permutation: HGRPPermutation;
  dropped: HGRPDroppedSubsystem[];
}

// Resolve a material's permutation from its preset values: a static subsystem that applies to
// the variant is enabled when its gate is 1 and every texture it consumes is present.
export function hgrpResolvePermutation(
  variant: HGRPShaderVariant,
  floats: Record<string, number>,
  textures: Record<string, string>,
): HGRPPermutationResolution {
  const enabled: HGRPSubsystemId[] = [];
  const dropped: HGRPDroppedSubsystem[] = [];
  for (const subsystem of hgrpApplicableSubsystems(variant)) {
    if (floats[subsystem.gate!] !== 1) {
      continue;
    }
    const missing = hgrpSubsystemTextures(subsystem, variant).filter(
      (slot) => textures[slot] === undefined,
    );
    if (missing.length > 0) {
      dropped.push({ subsystem: subsystem.id, gate: subsystem.gate!, missing });
    } else {
      enabled.push(subsystem.id);
    }
  }
  return { permutation: { variant, enabled }, dropped };
}

export function hgrpPermutationSuffix(enabled: readonly HGRPSubsystemId[]): string {
  return enabled.map((id) => SUBSYSTEM_SEPARATOR + id).join('');
}

export function hgrpPermutationShaderId(permutation: HGRPPermutation): HGRPPermutationShaderId {
  return `${HGRP_SHADER_ID_BY_VARIANT[permutation.variant]}${hgrpPermutationSuffix(
    permutation.enabled,
  )}` as HGRPPermutationShaderId;
}

// Split any HGRP shader id (material or pass) into its base id and enabled subsystems. The
// suffix must be canonical: known static subsystem ids in declaration order, none repeated.
export function hgrpSplitShaderId(shaderId: string): {
  base: string;
  enabled: HGRPSubsystemId[];
} {
  const [base, ...tokens] = shaderId.split(SUBSYSTEM_SEPARATOR);
  const enabled: HGRPSubsystemId[] = [];
  let cursor = -1;
  for (const token of tokens) {
    const index = HGRP_STATIC_SUBSYSTEMS.findIndex((subsystem) => subsystem.id === token);
    if (index < 0) {
      throw new Error(`HGRP shader id ${shaderId}: "${token}" is not a static subsystem`);
    }
    if (index <= cursor) {
      throw new Error(
        `HGRP shader id ${shaderId}: subsystems must follow declaration order without repeats`,
      );
    }
    cursor = index;
    enabled.push(HGRP_STATIC_SUBSYSTEMS[index].id);
  }
  return { base, enabled };
}

// Check that every enabled subsystem applies to the variant; returns the permutation.
export function hgrpPermutation(
  variant: HGRPShaderVariant,
  enabled: readonly HGRPSubsystemId[],
): HGRPPermutation {
  for (const id of enabled) {
    const subsystem = HGRP_STATIC_SUBSYSTEMS.find((candidate) => candidate.id === id);
    if (!subsystem || !hgrpSubsystemAppliesTo(subsystem, variant)) {
      throw new Error(`HGRP contract: subsystem ${id} does not apply to ${variant}`);
    }
  }
  return { variant, enabled };
}

// Inverse of hgrpPermutationShaderId; throws on anything that is not a canonical material id.
export function hgrpPermutationForShaderId(shaderId: string): HGRPPermutation {
  const { base, enabled } = hgrpSplitShaderId(shaderId);
  const variant = hgrpVariantForShaderId(base);
  if (!variant) {
    throw new Error(`Unknown HGRP material shader id: ${shaderId}`);
  }
  return hgrpPermutation(variant, enabled);
}

export function hgrpPermutationEnables(
  permutation: HGRPPermutation,
  subsystem: HGRPSubsystemId,
): boolean {
  return permutation.enabled.includes(subsystem);
}
