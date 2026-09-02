import { Entity, Transform3DComponent } from '@ecs';
import { quat, vec3 } from 'gl-matrix';

// Where the HGRP characters stand, and how big they are. The stage lays the characters out
// once, in LAYOUT space — metres at the assets' own scale, ground at y = 0 — and this module
// turns each layout slot plus the user's adjustments into the entity's transform:
//
//   world scale     = globalScale x character scale
//   anchor          = the model-space point set on the slot's ground point (bounds centre x/z,
//                     lowest y — the feet), so the model stands on the ground whatever its
//                     rip offset (Pelica's bind pose sits at x/z ≈ [-2.07, 4.97], Laevatian's is
//                     origin-centred)
//   slot ground pt  = globalScale x (slot + offset), lifted to the stage ground
//   position        = slot ground point - R(rotation) * (world scale * anchor)
//
// Subtracting the ROTATED, SCALED anchor keeps the feet on the slot point when the character
// is rotated or resized: the transform rotates about the model origin, which is not where
// the feet are. Global scale scales the layout too (slots spread apart with the characters)
// so the group keeps its arrangement; the ground plane (main.ts) does not move.
//
// The shaders read the draw's world scale off the model matrix (core/hgrp_transform.wgsl), so
// no shading constant needs retuning when these change.

export interface HGRPCharacterPlacement {
  label: string;
  entity: Entity;
  // Model-space point placed on the slot's ground point
  anchor: readonly [number, number, number];
  // Layout-space ground point of the slot (y is always 0)
  slot: readonly [number, number, number];
  // Calibration-panel adjustments, in layout metres / degrees / a multiplier on globalScale
  offset: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
}

export const hgrpStagePlacement = {
  // Uniform scale of the whole layout; 1 = the assets' metre scale. Larger values make the
  // characters fill the camera's orbit range, which is what the detail-inspection sessions
  // need. `?scale=` seeds it, the Stage tab edits it live.
  globalScale: 1,
  // Ground plane height (main.ts createPlane); the characters' feet sit here.
  groundY: -1,
  characters: [] as HGRPCharacterPlacement[],
};

export function hgrpScaleFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('scale');
  const parsed = raw === null ? NaN : Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

const scratchAnchor = vec3.create();
const scratchQuat = quat.create();

export function applyHGRPPlacement(placement: HGRPCharacterPlacement): void {
  const transform = placement.entity.getComponent<Transform3DComponent>(
    Transform3DComponent.componentName,
  );
  if (!transform) {
    return;
  }
  const { globalScale, groundY } = hgrpStagePlacement;
  const worldScale = globalScale * placement.scale;
  const { offset, rotation, slot, anchor } = placement;

  // Same quaternion construction as Transform3DComponent.getWorldMatrix (degrees in).
  quat.fromEuler(scratchQuat, rotation.x, rotation.y, rotation.z);
  vec3.set(scratchAnchor, anchor[0] * worldScale, anchor[1] * worldScale, anchor[2] * worldScale);
  vec3.transformQuat(scratchAnchor, scratchAnchor, scratchQuat);

  transform.setPosition([
    globalScale * (slot[0] + offset.x) - scratchAnchor[0],
    groundY + globalScale * offset.y - scratchAnchor[1],
    globalScale * (slot[2] + offset.z) - scratchAnchor[2],
  ]);
  transform.setRotation([
    (rotation.x * Math.PI) / 180,
    (rotation.y * Math.PI) / 180,
    (rotation.z * Math.PI) / 180,
  ]);
  transform.setScale([worldScale, worldScale, worldScale]);
}

export function applyAllHGRPPlacements(): void {
  for (const placement of hgrpStagePlacement.characters) {
    applyHGRPPlacement(placement);
  }
}

export function resetHGRPPlacement(placement: HGRPCharacterPlacement): void {
  placement.offset.x = 0;
  placement.offset.y = 0;
  placement.offset.z = 0;
  placement.rotation.x = 0;
  placement.rotation.y = 0;
  placement.rotation.z = 0;
  placement.scale = 1;
  applyHGRPPlacement(placement);
}
