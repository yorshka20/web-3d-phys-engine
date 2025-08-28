import { BufferManager } from '@renderer/webGPU';
import { GeometryManager } from '../../GeometryManager';

export function createGeometryBuffer(
  bufferManager: BufferManager,
  geometryManager: GeometryManager,
) {
  // Use geometry manager to create unit cube data
  const cubeGeometry = geometryManager.getGeometry('cube');

  // Create vertex buffer (auto-registered to resource manager)
  bufferManager.createVertexBuffer('Cube Vertices', cubeGeometry.geometry.vertices.buffer);
  console.log('Created and auto-registered: Cube Vertices');

  // Create index buffer (auto-registered to resource manager)
  bufferManager.createIndexBuffer('Cube Indices', cubeGeometry.geometry.indices.buffer);
  console.log('Created and auto-registered: Cube Indices');

  // Create uniform buffer for MVP matrix (auto-registered to resource manager)
  // 4x4 matrix, 16 floats. Initialized to identity.
  // prettier-ignore
  const mvpMatrixData = new Float32Array([
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
  ]);

  bufferManager.createUniformBuffer('MVP Matrix Uniforms', mvpMatrixData.buffer);
  console.log('Created and auto-registered: MVP Matrix Uniforms');
}
