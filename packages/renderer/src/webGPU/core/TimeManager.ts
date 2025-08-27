import { BufferManager } from './BufferManager';
import { BufferType } from './types';

export class TimeManager {
  static TimeBufferLabel = 'Time';

  private startTime = performance.now();
  private lastTime = 0;
  private device: GPUDevice;
  private bufferManager: BufferManager;

  // max frame count is 2^32 - 1
  private frameCount = 0;

  constructor(device: GPUDevice, bufferManager: BufferManager) {
    this.device = device;
    this.bufferManager = bufferManager;
  }

  getBuffer() {
    let buffer = this.bufferManager.getBufferByLabel(TimeManager.TimeBufferLabel);
    if (!buffer) {
      buffer = this.bufferManager.createBuffer({
        type: BufferType.UNIFORM,
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: TimeManager.TimeBufferLabel,
      });
      // todo: auto register
    }
    return buffer;
  }

  updateTime() {
    const now = performance.now();
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
