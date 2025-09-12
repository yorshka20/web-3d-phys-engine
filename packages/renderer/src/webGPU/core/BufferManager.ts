import { Inject, Injectable, SmartResource } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { BufferDescriptor, BufferPoolItem, BufferType } from './types';
import { ResourceType } from './types/constant';

/**
 * WebGPU buffer manager
 * responsible for creating, managing, and updating various types of GPU buffer
 */
@Injectable(ServiceTokens.BUFFER_MANAGER, {
  lifecycle: 'singleton',
})
export class BufferManager {
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  private bufferPools: Map<BufferType, BufferPoolItem[]> = new Map();
  private activeBuffers: Set<GPUBuffer> = new Set();
  private bufferLabels: Map<GPUBuffer, string> = new Map();
  private bufferCache: Map<string, GPUBuffer> = new Map(); // Internal cache for quick lookup

  //  statistics
  private totalAllocated: number = 0;
  private totalActive: number = 0;

  constructor() {
    this.initializeBufferPools();
  }

  /**
   * Get resource manager
   */
  getResourceManager(): WebGPUResourceManager | undefined {
    return this.resourceManager;
  }

  /**
   * initialize buffer pool
   */
  private initializeBufferPools(): void {
    Object.values(BufferType).forEach((type) => {
      this.bufferPools.set(type, []);
    });
  }

  /**
   * create buffer with automatic resource registration
   *
   * this method will not be decorated with `@AutoRegisterResource`
   *
   * @param descriptor buffer descriptor
   * @returns created GPU buffer
   */
  createBuffer(descriptor: BufferDescriptor): GPUBuffer {
    // Check cache first
    const cachedBuffer = this.bufferCache.get(descriptor.label);
    if (cachedBuffer) {
      console.log(`Using cached buffer: ${descriptor.label}`);
      return cachedBuffer;
    }

    // WebGPU requires buffer sizes to be aligned to 4-byte boundaries
    const alignedSize = Math.ceil(descriptor.size / 4) * 4;

    const buffer = this.device.createBuffer({
      size: alignedSize,
      usage: descriptor.usage,
      mappedAtCreation: descriptor.mappedAtCreation || false,
      label: descriptor.label,
    });

    // record buffer information
    this.activeBuffers.add(buffer);
    this.bufferLabels.set(buffer, descriptor.label);
    this.bufferCache.set(descriptor.label, buffer);
    this.totalAllocated += alignedSize;
    this.totalActive += alignedSize;

    // add to the corresponding pool
    const pool = this.bufferPools.get(descriptor.type) || [];
    pool.push({
      buffer,
      size: alignedSize,
      inUse: true,
      lastUsed: Date.now(),
    });
    this.bufferPools.set(descriptor.type, pool);

    // Note: Auto-registration is now handled by decorators

    console.log(
      `Created ${descriptor.type} buffer: ${alignedSize} bytes (original: ${descriptor.size} bytes)`,
    );

    return buffer;
  }

  /**
   * create vertex buffer
   * @param data vertex data
   * @param label label
   * @returns vertex buffer
   */
  @SmartResource(ResourceType.BUFFER, {
    cache: true,
    lifecycle: 'frame',
    maxCacheSize: 20,
  })
  createVertexBuffer(label: string, data: ArrayBuffer): GPUBuffer {
    // Ensure buffer size is multiple of 4 bytes for WebGPU alignment requirement
    const alignedSize = Math.ceil(data.byteLength / 4) * 4;

    const buffer = this.createBuffer({
      type: BufferType.VERTEX,
      size: alignedSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label,
    });

    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  /**
   * create index buffer
   * @param data index data
   * @param label label
   * @returns index buffer
   */
  @SmartResource(ResourceType.BUFFER, {
    cache: true,
    lifecycle: 'frame',
    maxCacheSize: 20,
  })
  createIndexBuffer(label: string, data: ArrayBuffer): GPUBuffer {
    // Ensure buffer size is multiple of 4 bytes for WebGPU alignment requirement
    const alignedSize = Math.ceil(data.byteLength / 4) * 4;

    const buffer = this.createBuffer({
      type: BufferType.INDEX,
      size: alignedSize,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      label,
    });

    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  /**
   * create uniform buffer
   * @param data uniform data
   * @param label label
   * @returns uniform buffer
   */
  @SmartResource(ResourceType.BUFFER, {
    cache: true,
    lifecycle: 'frame',
    maxCacheSize: 20,
  })
  createUniformBuffer(label: string, data: ArrayBuffer): GPUBuffer {
    const buffer = this.createBuffer({
      type: BufferType.UNIFORM,
      size: data.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label,
    });

    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  /**
   * create storage buffer
   * @param data storage data
   * @param label label
   * @returns storage buffer
   */
  @SmartResource(ResourceType.BUFFER, {
    lifecycle: 'persistent',
  })
  createStorageBuffer(label: string, data: ArrayBuffer): GPUBuffer {
    const buffer = this.createBuffer({
      type: BufferType.STORAGE,
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label,
    });

    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  /**
   * create staging buffer
   * @param size size
   * @param label label
   * @returns staging buffer
   */
  @SmartResource(ResourceType.BUFFER, {
    pool: true,
    lifecycle: 'frame',
  })
  createStagingBuffer(label: string, size: number): GPUBuffer {
    return this.createBuffer({
      type: BufferType.STAGING,
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label,
    });
  }

  /**
   * update buffer data
   * @param buffer buffer to update
   * @param data new data
   * @param offset offset
   */
  updateBuffer(buffer: GPUBuffer, data: ArrayBuffer, offset: number = 0): void {
    // Ensure offset is aligned to 4 bytes
    const alignedOffset = Math.floor(offset / 4) * 4;

    // Ensure data size is aligned to 4 bytes
    const alignedDataSize = Math.ceil(data.byteLength / 4) * 4;

    // If the original data size doesn't match the aligned size, we need to pad it
    if (data.byteLength !== alignedDataSize) {
      const paddedData = new ArrayBuffer(alignedDataSize);
      const originalView = new Uint8Array(data);
      const paddedView = new Uint8Array(paddedData);
      paddedView.set(originalView);
      this.device.queue.writeBuffer(buffer, alignedOffset, paddedData);
    } else {
      this.device.queue.writeBuffer(buffer, alignedOffset, data);
    }
  }

  /**
   * read buffer data
   * @description: read buffer data from GPU to CPU. this will create a staging buffer and destroy it after use
   * @param buffer buffer to read
   * @param offset offset
   * @param size size
   * @returns Promise<ArrayBuffer>
   */
  async readBuffer(buffer: GPUBuffer, offset: number = 0, size?: number): Promise<ArrayBuffer> {
    const readSize = size || buffer.size;

    // Ensure offset is aligned to 4 bytes
    const alignedOffset = Math.floor(offset / 4) * 4;

    // Ensure read size is aligned to 4 bytes
    const alignedReadSize = Math.ceil(readSize / 4) * 4;

    // create staging buffer. will be destroyed after use
    const stagingBuffer = this.createStagingBuffer('stagingBuffer', alignedReadSize);
    // copy data to staging buffer
    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(buffer, alignedOffset, stagingBuffer, 0, alignedReadSize);
    this.device.queue.submit([commandEncoder.finish()]);

    // map and read data
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const copyArrayBuffer = stagingBuffer.getMappedRange();
    const result = copyArrayBuffer.slice(0, readSize);
    stagingBuffer.unmap();

    // clean up staging buffer
    this.destroyBuffer(stagingBuffer);

    return result;
  }

  /**
   * copy buffer
   * @param source source buffer
   * @param destination destination buffer
   * @param sourceOffset source offset
   * @param destinationOffset destination offset
   * @param size size
   */
  copyBuffer(
    source: GPUBuffer,
    destination: GPUBuffer,
    sourceOffset: number = 0,
    destinationOffset: number = 0,
    size?: number,
  ): void {
    const copySize =
      size || Math.min(source.size - sourceOffset, destination.size - destinationOffset);

    // Ensure offsets are aligned to 4 bytes
    const alignedSourceOffset = Math.floor(sourceOffset / 4) * 4;
    const alignedDestOffset = Math.floor(destinationOffset / 4) * 4;

    // Ensure copy size is aligned to 4 bytes
    const alignedCopySize = Math.floor(copySize / 4) * 4;

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(
      source,
      alignedSourceOffset,
      destination,
      alignedDestOffset,
      alignedCopySize,
    );
    this.device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * destroy buffer
   * @param buffer buffer to destroy
   */
  destroyBuffer(buffer: GPUBuffer): void {
    if (this.activeBuffers.has(buffer)) {
      this.activeBuffers.delete(buffer);
      this.totalActive -= buffer.size;

      const label = this.bufferLabels.get(buffer) || 'unknown';
      console.log(`Destroyed buffer: ${label} (${buffer.size} bytes)`);

      // Remove from cache
      this.bufferCache.delete(label);
      this.bufferLabels.delete(buffer);
      buffer.destroy();
    }
  }

  /**
   * get buffer from pool
   * @param type buffer type
   * @param size size
   * @returns available buffer or null
   */
  getBufferFromPool(type: BufferType, size: number): GPUBuffer | null {
    const pool = this.bufferPools.get(type) || [];

    // find suitable unused buffer
    for (const item of pool) {
      if (!item.inUse && item.size >= size) {
        item.inUse = true;
        item.lastUsed = Date.now();
        return item.buffer;
      }
    }

    return null;
  }

  /**
   * return buffer to pool
   * @param buffer buffer to return
   */
  returnBufferToPool(buffer: GPUBuffer): void {
    const pool = this.bufferPools.get(BufferType.STORAGE) || [];

    for (const item of pool) {
      if (item.buffer === buffer) {
        item.inUse = false;
        item.lastUsed = Date.now();
        break;
      }
    }
  }

  /**
   * clean up unused buffers
   * @param maxAge max age (milliseconds)
   */
  cleanupUnusedBuffers(maxAge: number = 60000): void {
    const now = Date.now();

    for (const [type, pool] of this.bufferPools) {
      const remainingBuffers = pool.filter((item) => {
        if (!item.inUse && now - item.lastUsed > maxAge) {
          this.destroyBuffer(item.buffer);
          return false;
        }
        return true;
      });

      this.bufferPools.set(type, remainingBuffers);
    }
  }

  /**
   * start new frame
   */
  beginFrame(): void {
    // can add frame level buffer management logic here
  }

  /**
   * end frame
   */
  endFrame(): void {
    // clean up unused buffers
    this.cleanupUnusedBuffers();
  }

  /**
   * get memory usage statistics
   */
  getMemoryUsage(): Record<BufferType, number> {
    const poolSizes: Record<BufferType, number> = {
      [BufferType.VERTEX]: 0,
      [BufferType.INDEX]: 0,
      [BufferType.UNIFORM]: 0,
      [BufferType.STORAGE]: 0,
      [BufferType.STAGING]: 0,
      [BufferType.COPY_SRC]: 0,
      [BufferType.COPY_DST]: 0,
    };

    for (const [type, pool] of Object.entries(this.bufferPools)) {
      poolSizes[type as BufferType] = pool.length;
    }

    return poolSizes;
  }

  /**
   * get buffer label
   */
  getBufferLabel(buffer: GPUBuffer): string {
    return this.bufferLabels.get(buffer) || 'unknown';
  }

  /**
   * get buffer by label
   * @param label label
   * @returns buffer or undefined
   */
  getBufferByLabel(label: string): GPUBuffer | undefined {
    // Check cache first for performance
    const cachedBuffer = this.bufferCache.get(label);
    if (cachedBuffer && this.activeBuffers.has(cachedBuffer)) {
      return cachedBuffer;
    }

    // Fallback to label lookup
    for (const [buffer, bufferLabel] of this.bufferLabels) {
      if (bufferLabel === label) {
        return buffer;
      }
    }
    return undefined;
  }

  /**
   * get vertex buffer by label
   * @param label label
   * @returns vertex buffer or undefined
   */
  getVertexBuffer(label: string): GPUBuffer | undefined {
    const buffer = this.getBufferByLabel(label);
    if (buffer && this.activeBuffers.has(buffer)) {
      return buffer;
    }
    return undefined;
  }

  /**
   * get uniform buffer by label
   * @param label label
   * @returns uniform buffer or undefined
   */
  getUniformBuffer(label: string): GPUBuffer | undefined {
    const buffer = this.getBufferByLabel(label);
    if (buffer && this.activeBuffers.has(buffer)) {
      return buffer;
    }
    return undefined;
  }

  /**
   * get index buffer by label
   * @param label label
   * @returns index buffer or undefined
   */
  getIndexBuffer(label: string): GPUBuffer | undefined {
    const buffer = this.getBufferByLabel(label);
    if (buffer && this.activeBuffers.has(buffer)) {
      return buffer;
    }
    return undefined;
  }

  /**
   * get storage buffer by label
   * @param label label
   * @returns storage buffer or undefined
   */
  getStorageBuffer(label: string): GPUBuffer | undefined {
    const buffer = this.getBufferByLabel(label);
    if (buffer && this.activeBuffers.has(buffer)) {
      return buffer;
    }
    return undefined;
  }

  /**
   * register external created buffer
   * @param buffer GPU buffer
   * @param label label
   */
  registerBuffer(buffer: GPUBuffer, label: string): void {
    // record buffer information
    this.activeBuffers.add(buffer);
    this.bufferLabels.set(buffer, label);
    this.bufferCache.set(label, buffer);

    // add to the corresponding pool
    const pool = this.bufferPools.get(BufferType.STORAGE) || [];
    pool.push({
      buffer,
      size: buffer.size,
      inUse: true,
      lastUsed: Date.now(),
    });
    this.bufferPools.set(BufferType.STORAGE, pool);

    console.log(`Registered external buffer: ${label} (${buffer.size} bytes)`);
  }

  /**
   * destroy all buffers
   */
  onDestroy(): void {
    for (const buffer of this.activeBuffers) {
      buffer.destroy();
    }

    this.activeBuffers.clear();
    this.bufferLabels.clear();
    this.bufferCache.clear();
    this.bufferPools.clear();
    this.totalAllocated = 0;
    this.totalActive = 0;
  }

  cleanupFrameResources(): void {
    // clean up unused buffers
    this.cleanupUnusedBuffers();
  }
}
