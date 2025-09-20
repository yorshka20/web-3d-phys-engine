@group(0) @binding(0) var<uniform> morph_info: MorphInfo;
@group(0) @binding(1) var<storage, read> base_vertices: array<PMXVertexInput>;
@group(0) @binding(2) var<storage, read> morph_targets: array<PMXVertexInput>;
@group(0) @binding(3) var<storage, read> morph_weights: array<f32>;
@group(0) @binding(4) var<storage, read_write> output_vertices: array<PMXVertexInput>;
