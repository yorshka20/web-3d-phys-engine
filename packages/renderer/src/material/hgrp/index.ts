// The HGRP (HypergryphRenderPipeline) material family: descriptor vocabulary plus the
// contract that turns it into GPU state. Declared once here, derived everywhere else:
//
//   descriptor.ts   descriptor / preset shapes, shader variants, preset -> descriptor factory
//   subsystems.ts   feature table (master switch, texture slots, draw-list params)
//   textures.ts     texture slot registry, per-variant slot order, group-2 binding numbers
//   primitives.ts   param / field / struct types and constructors
//   params.ts       the uniform field tables (with composite pack rules)
//   layout.ts       byte layouts of the uniform structs + the packer
//   wgsl.ts         generated shader fragments (struct declarations, group-2 bindings)
//   gui.ts          calibration GUI schema
//   validate.ts     cross-table self-check, run below at module load
//
// GPU-object factories (bind group layouts) live in webGPU/core/HGRPMaterialResources.ts; the
// pass stages in webGPU/renderer/passes/hgrp/.

export * from './descriptor';
export * from './gui';
export * from './layout';
export * from './params';
export * from './primitives';
export * from './subsystems';
export * from './textures';
export * from './validate';
export * from './wgsl';

import { validateHGRPContract } from './validate';

validateHGRPContract();
