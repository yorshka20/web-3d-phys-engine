export class WebGPUResourceManager {
  static instance: WebGPUResourceManager;
  private resources: Map<string, Any> = new Map();

  constructor() {
    if (WebGPUResourceManager.instance) {
      return WebGPUResourceManager.instance;
    }

    WebGPUResourceManager.instance = this;
    console.log('WebGPUResourceManager initialized');
  }

  /**
   * Registers a resource with a given ID.
   * @param id Unique identifier for the resource.
   * @param resource The WebGPU resource (e.g., GPUBuffer, GPUBindGroup, GPURenderPipeline).
   */
  public registerResource<T>(id: string, resource: T): void {
    if (this.resources.has(id)) {
      console.warn(`Resource with ID '${id}' already registered. Overwriting.`);
    }
    this.resources.set(id, resource);
  }

  /**
   * Retrieves a registered resource by its ID.
   * @param id Unique identifier for the resource.
   * @returns The resource if found, otherwise undefined.
   */
  public getResource<T>(id: string): T {
    const resource = this.resources.get(id);
    if (resource === undefined) {
      throw new Error(`Resource with ID '${id}' not found.`);
    }
    return resource as T;
  }

  /**
   * Asynchronously loads and registers a resource. This is a placeholder for more complex loading logic.
   * For immediate resources (like buffers created from existing data), use registerResource.
   * @param id Unique identifier for the resource.
   * @param loadFn A function that returns a Promise resolving to the resource.
   */
  public async loadResource<T>(id: string, loadFn: () => Promise<T>): Promise<T> {
    if (this.resources.has(id)) {
      return this.resources.get(id) as T;
    }
    const resource = await loadFn();
    this.registerResource(id, resource);
    return resource;
  }

  /**
   * Releases a resource by its ID. This is a placeholder for actual WebGPU resource destruction.
   * In a real application, this would involve calling destroy() on GPUBuffer, GPUTexture, etc.
   * @param id Unique identifier for the resource.
   */
  public releaseResource(id: string): void {
    if (this.resources.has(id)) {
      const resource = this.resources.get(id);
      // TODO: Implement actual WebGPU resource destruction logic here
      if (resource && typeof (resource as Any).destroy === 'function') {
        (resource as Any).destroy();
      }
      this.resources.delete(id);
      console.log(`Resource with ID '${id}' released.`);
    } else {
      console.warn(`Attempted to release unknown resource with ID '${id}'.`);
    }
  }

  /**
   * Clears all registered resources.
   * In a real application, this would involve calling destroy() on all managed WebGPU resources.
   */
  public clearAllResources(): void {
    this.resources.forEach((resource, id) => {
      if (resource && typeof (resource as Any).destroy === 'function') {
        (resource as Any).destroy();
      }
      console.log(`Resource with ID '${id}' released.`);
    });
    this.resources.clear();
    console.log('All WebGPU resources cleared.');
  }
}
