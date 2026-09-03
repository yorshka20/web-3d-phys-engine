/**
 * What the HGRP draw stages need that the container cannot provide.
 *
 * The group-3 bind group carries the per-frame HGRP globals (the prepass depth texture, the
 * scene lighting, the debug view). It is rebuilt whenever that texture is recreated, so it is
 * renderer-owned lifecycle state reached through a closure, not a service.
 *
 * Shared by the eye-overlay, brow-composite and outline stages, which need exactly the same
 * thing.
 */
export interface HGRPFrameGlobals {
  getFrameBindGroup(): GPUBindGroup;
}
