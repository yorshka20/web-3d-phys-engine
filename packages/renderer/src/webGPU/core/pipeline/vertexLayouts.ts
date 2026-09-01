/**
 * The fixed glTF vertex buffer layout: 26 floats per vertex, matching the packing order in
 * AssetLoader.convertGLTFPrimitiveToGeometry. Single definition shared by PipelineManager
 * (material pipelines) and pass-private pipelines (HGRP outline).
 */
export function createGltfVertexBufferLayout(): GPUVertexBufferLayout {
  const attributes: GPUVertexAttribute[] = [];
  let offset = 0;

  // Position (location 0) - 3 floats
  attributes.push({ format: 'float32x3', offset, shaderLocation: 0 });
  offset += 12;

  // Normal (location 1) - 3 floats
  attributes.push({ format: 'float32x3', offset, shaderLocation: 1 });
  offset += 12;

  // Texcoord_0 (location 2) - 2 floats
  attributes.push({ format: 'float32x2', offset, shaderLocation: 2 });
  offset += 8;

  // Texcoord_1 (location 3) - 2 floats
  attributes.push({ format: 'float32x2', offset, shaderLocation: 3 });
  offset += 8;

  // Color_0 (location 4) - 4 floats
  attributes.push({ format: 'float32x4', offset, shaderLocation: 4 });
  offset += 16;

  // Joints_0 (location 5) - 4 uints
  attributes.push({ format: 'uint32x4', offset, shaderLocation: 5 });
  offset += 16;

  // Weights_0 (location 6) - 4 floats
  attributes.push({ format: 'float32x4', offset, shaderLocation: 6 });
  offset += 16;

  // Tangent (location 7) - 4 floats
  attributes.push({ format: 'float32x4', offset, shaderLocation: 7 });
  offset += 16;

  return {
    arrayStride: offset, // 26 * 4 = 104 bytes
    attributes,
  };
}
