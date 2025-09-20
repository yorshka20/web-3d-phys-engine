import { BufferManager } from './BufferManager';
import { ServiceTokens } from './decorators/DIContainer';
import { Inject, Injectable } from './decorators/ResourceDecorators';
import { BufferType } from './types';

@Injectable(ServiceTokens.TIME_MANAGER, {
  lifecycle: 'singleton',
})
export class TimeManager {
  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  @Inject(ServiceTokens.BUFFER_MANAGER)
  private bufferManager!: BufferManager;

  private startTime = performance.now();
  private lastTime = 0;

  // max frame count is 2^32 - 1
  private frameCount = 0;

  constructor() {
    this.lastTime = 0;
    this.frameCount = 0;
  }

  getBuffer() {
    let buffer = this.bufferManager.getBufferByLabel('time_buffer');
    if (!buffer) {
      buffer = this.bufferManager.createCustomBuffer('time_buffer', {
        type: BufferType.UNIFORM,
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    return buffer;
  }

  updateTime(now: number) {
    const time = (now - this.startTime) * 0.001; // convert to seconds
    const deltaTime = (now - this.lastTime) * 0.001;

    // Create a buffer that matches the shader struct layout exactly
    // We need to handle the mixed data types properly
    const bufferView = new DataView(new ArrayBuffer(16)); // 16 bytes aligned

    // Write time as f32 (4 bytes)
    bufferView.setFloat32(0, time, true); // little-endian
    // Write deltaTime as f32 (4 bytes)
    bufferView.setFloat32(4, deltaTime, true); // little-endian
    // Write frameCount as u32 (4 bytes)
    bufferView.setUint32(8, this.frameCount, true); // little-endian
    // Write padding as u32 (4 bytes)
    bufferView.setUint32(12, 0, true); // little-endian

    this.device.queue.writeBuffer(this.getBuffer(), 0, bufferView.buffer);

    this.lastTime = now;
    this.frameCount++;
  }
}
