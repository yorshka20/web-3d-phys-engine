import { GeometryInstance } from '@renderer/webGPU/renderer/WebGPURenderer';
import { RenderContext } from '@renderer/webGPU/types';
import { mat4 } from 'gl-matrix';
import { WebGPUResourceManager } from '../../ResourceManager';

export function createGeometryRenderPass(
  renderPass: GPURenderPassEncoder,
  context: RenderContext,
  resourceManager: WebGPUResourceManager,
  device: GPUDevice,
  geometryInstances: GeometryInstance[],
) {
  // Render geometry instances
  const mainPipeline = resourceManager.getRenderPipelineResource('main_pipeline');
  if (!mainPipeline) {
    throw new Error('Main pipeline not found');
  }

  renderPass.setPipeline(mainPipeline.pipeline);

  const now = performance.now() / 1000;
  // Use camera data from render context
  const projectionMatrix = mat4.create();
  mat4.copy(projectionMatrix, context.globalUniforms.projectionMatrix);

  const viewMatrix = mat4.create();
  mat4.copy(viewMatrix, context.globalUniforms.viewMatrix);

  for (const instance of geometryInstances) {
    // Update model matrix for this instance
    const modelMatrix = mat4.create();

    // Apply scale
    mat4.scale(modelMatrix, modelMatrix, instance.scale);

    // Apply rotation
    mat4.rotateY(modelMatrix, modelMatrix, now * 0.5 + instance.rotation[1]);
    mat4.rotateX(modelMatrix, modelMatrix, now * 0.3 + instance.rotation[0]);
    mat4.rotateZ(modelMatrix, modelMatrix, instance.rotation[2]);

    // Apply position
    mat4.translate(modelMatrix, modelMatrix, instance.position);

    // Calculate MVP matrix for this instance
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
    mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

    // Update this instance's MVP uniform buffer
    device.queue.writeBuffer(instance.mvpBuffer, 0, new Float32Array(mvpMatrix));

    // Use this instance's MVPBindGroup
    renderPass.setBindGroup(1, instance.mvpBindGroup);

    // set vertex buffer
    renderPass.setVertexBuffer(0, instance.geometry.vertexBuffer);
    // set index buffer
    renderPass.setIndexBuffer(instance.geometry.indexBuffer, 'uint16');

    // Draw this instance
    renderPass.drawIndexed(instance.geometry.indexCount);
  }
}
