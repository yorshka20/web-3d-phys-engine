// Simple bindings for basic shaders (Coordinate, Emissive, etc.)
// This file defines the minimal binding layout for simple shaders

// Group 0: Global uniforms (Time)
@group(0) @binding(0) var<uniform> time_data: TimeUniforms;

// Group 1: Transform uniforms (MVP)
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;
