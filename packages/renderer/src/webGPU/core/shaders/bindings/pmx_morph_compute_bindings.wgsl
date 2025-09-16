@group(0) @binding(0) var<uniform> morphInfo: MorphInfo;
@group(0) @binding(1) var<storage, read> baseVertices: array<VertexInput>;
@group(0) @binding(2) var<storage, read> morphTargets: array<VertexInput>;
@group(0) @binding(3) var<storage, read> morphWeights: array<f32>;
@group(0) @binding(4) var<storage, read_write> outputVertices: array<VertexInput>;
