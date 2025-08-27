import { WebGPUResourceManager } from './ResourceManager';
import { BufferDescriptor, BufferPoolItem, BufferType } from './types';
import { ResourceState, ResourceType } from './types/constant';
import { BufferResource } from './types/resource';

/**
 * WebGPU buffer manager
 * responsible for creating, managing, and updating various types of GPU buffer
 */
export class BufferManager {
  private device: GPUDevice;
  private bufferPools: Map<BufferType, BufferPoolItem[]> = new Map();
  private activeBuffers: Set<GPUBuffer> = new Set();
  private bufferLabels: Map<GPUBuffer, string> = new Map();
  private bufferCache: Map<string, GPUBuffer> = new Map(); // Internal cache for quick lookup
  private resourceManager?: WebGPUResourceManager; // Reference to resource manager

  //  statistics
  private totalAllocated: number = 0;
  private totalActive: number = 0;

  constructor(device: GPUDevice) {
    this.device = device;
    this.initializeBufferPools();
  }

  /**
   * Set resource manager reference for auto-registration
   */
  setResourceManager(resourceManager: WebGPUResourceManager): void {
    this.resourceManager = resourceManager;
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

    // Auto-register to resource manager if available
    this.autoRegisterBuffer(buffer, descriptor.label, descriptor.type);

    console.log(
      `Created ${descriptor.type} buffer: ${alignedSize} bytes (original: ${descriptor.size} bytes)`,
    );

    return buffer;
  }

  /**
   * Auto-register buffer to resource manager
   */
  private autoRegisterBuffer(buffer: GPUBuffer, label: string, type: BufferType): void {
    if (!this.resourceManager) {
      console.warn(`Resource manager not set, skipping auto-registration for buffer: ${label}`);
      return;
    }

    // Create resource descriptor
    const resourceDescriptor = {
      id: label,
      type: ResourceType.BUFFER,
      factory: async (): Promise<BufferResource> => ({
        type: ResourceType.BUFFER,
        state: ResourceState.READY,
        dependencies: [],
        destroy: () => {
          this.destroyBuffer(buffer);
        },
        buffer,
      }),
      dependencies: [],
      metadata: {
        bufferType: type,
        size: buffer.size,
        usage: buffer.usage,
      },
    };

    // Register resource
    this.resourceManager.createResource(resourceDescriptor).catch((error) => {
      console.error(`Failed to auto-register buffer ${label}:`, error);
    });
  }

  /**
   * create vertex buffer
   * @param data vertex data
   * @param label label
   * @returns vertex buffer
   */
  createVertexBuffer(data: ArrayBuffer, label: string): GPUBuffer {
    const buffer = this.createBuffer({
      type: BufferType.VERTEX,
      size: data.byteLength,
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
  createIndexBuffer(data: ArrayBuffer, label: string): GPUBuffer {
    const buffer = this.createBuffer({
      type: BufferType.INDEX,
      size: data.byteLength,
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
  createUniformBuffer(data: ArrayBuffer, label: string): GPUBuffer {
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
  createStorageBuffer(data: ArrayBuffer, label: string): GPUBuffer {
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
  createStagingBuffer(size: number, label: string): GPUBuffer {
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
    const stagingBuffer = this.createStagingBuffer(alignedReadSize, 'stagingBuffer');
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
}
