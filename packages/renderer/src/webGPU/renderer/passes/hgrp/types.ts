/**
 * What the HGRP draw stages need that the container cannot provide.
 *
 * The group-3 bind group carries the per-frame HGRP globals (the prepass depth the
 * screen-space rim samples). It is rebuilt whenever that texture is recreated, so it is
 * renderer-owned lifecycle state reached through a closure, not a service.
 *
 * Shared by the eye-overlay and brow-composite stages because they need exactly the same
 * thing — the outline stage needs nothing at all.
 */
export interface HGRPFrameGlobals {
  getFrameBindGroup(): GPUBindGroup;
}
