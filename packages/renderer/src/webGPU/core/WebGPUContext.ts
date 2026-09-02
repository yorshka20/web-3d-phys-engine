import { ServiceTokens } from './decorators/DIContainer';
import { Injectable } from './decorators/ResourceDecorators';
import { WebGPUContextOptions } from './types';

// GPUSupportedLimits exposes every limit as a getter on its prototype, so Object.entries /
// JSON.stringify see an empty object. for...in walks the prototype chain and is the only
// way to read the whole set generically.
function limitsToRecord(limits: GPUSupportedLimits): Record<string, number> {
  const record: Record<string, number> = {};
  for (const key in limits) {
    const value = (limits as unknown as Record<string, unknown>)[key];
    if (typeof value === 'number') record[key] = value;
  }
  return record;
}

// The limits that bound the shading architecture: how many textures a single shader may
// sample, and how many bind groups a pipeline may carry. Whether a subsystem can stay a
// runtime branch instead of a compile-time variant depends on the headroom here, so the
// figures are logged rather than assumed (see learnings shader-feature-gating).
const ARCHITECTURE_LIMITS = [
  'maxSampledTexturesPerShaderStage',
  'maxSamplersPerShaderStage',
  'maxBindGroups',
  'maxBindingsPerBindGroup',
  'maxUniformBufferBindingSize',
  'maxStorageBufferBindingSize',
  // the only limit the renderer asks to raise above the WebGPU default
  'maxComputeWorkgroupStorageSize',
] as const;

/**
 * WebGPU context manager
 * manage GPU adapter, device and canvas context
 */
@Injectable(ServiceTokens.WEBGPU_CONTEXT, {
  lifecycle: 'singleton',
})
export class WebGPUContext {
  private device: GPUDevice | null = null;
  private adapter: GPUAdapter | null = null;
  private context: GPUCanvasContext | null = null;
  private canvas: HTMLCanvasElement | null = null;

  // device features
  private features: GPUSupportedFeatures | null = null;
  private limits: GPUSupportedLimits | null = null;

  // options
  private powerPreference: GPUPowerPreference = 'high-performance';
  private forceFallbackAdapter: boolean = false;

  constructor() {
    this.checkWebGPUSupport();
  }

  /**
   * check webgpu support
   */
  private checkWebGPUSupport(): void {
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }
  }

  /**
   * inti context
   * @param canvas HTML canvas element
   * @param options init options
   */
  async initialize(canvas: HTMLCanvasElement, options: WebGPUContextOptions = {}): Promise<void> {
    this.canvas = canvas;
    this.powerPreference = options.powerPreference || 'high-performance';
    this.forceFallbackAdapter = options.forceFallbackAdapter || false;

    try {
      // 1. request GPU adapter
      const adapter = await this.requestAdapter(options);

      // 2. request GPU device
      const device = await this.requestDevice(options);

      // 3. configure canvas context
      await this.configureCanvas();

      console.log('WebGPU context initialized successfully');
      console.log('Device:', this.device);
      console.log('Features:', this.features);
      this.logLimits(device.limits, adapter.limits);
    } catch (error) {
      console.error('Failed to initialize WebGPU context:', error);
      throw error;
    }
  }

  /**
   * request GPU adapter
   * @param options adapter request options
   * @returns GPU adapter
   */
  private async requestAdapter(options?: WebGPUContextOptions): Promise<GPUAdapter> {
    const adapterOptions: GPURequestAdapterOptions = {
      powerPreference: options?.powerPreference || 'high-performance',
      forceFallbackAdapter: options?.forceFallbackAdapter || false,
    };

    const adapter = await navigator.gpu.requestAdapter(adapterOptions);
    if (!adapter) {
      throw new Error('No GPU adapter found');
    }

    this.adapter = adapter;

    return adapter;
  }

  /**
   * request GPU device
   * @param options context options carrying the caller's required features and limits
   * @returns GPU device
   *
   * A limit the adapter cannot meet makes requestDevice reject, naming the limit — that is
   * the intended outcome. Dropping the caller's request instead would leave the renderer
   * running on default limits while believing it had asked for more.
   */
  private async requestDevice(options?: WebGPUContextOptions): Promise<GPUDevice> {
    if (!this.adapter) {
      throw new Error('No adapter available');
    }

    const deviceOptions: GPUDeviceDescriptor = {
      label: 'WebGPU Device',
      requiredFeatures: options?.requiredFeatures ? [...new Set(options.requiredFeatures)] : [],
      requiredLimits: options?.requiredLimits ?? {},
    };

    const device = await this.adapter.requestDevice(deviceOptions);
    if (!device) {
      throw new Error('Failed to create GPU device');
    }

    this.device = device;
    this.features = device.features;
    this.limits = device.limits;

    // handle device lost
    this.device.lost.then(this.handleDeviceLost);

    // WebGPU validation/OOM errors surface asynchronously; without a handler they are easy to
    // miss and a failing draw silently blanks the frame.
    this.device.onuncapturederror = (event: GPUUncapturedErrorEvent) => {
      console.error('[WebGPUContext] Uncaptured WebGPU error:', event.error.message);
    };

    return device;
  }

  /**
   * configure canvas context
   */
  private async configureCanvas(): Promise<void> {
    if (!this.canvas || !this.device) {
      throw new Error('Canvas or device not available');
    }

    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;

    if (!this.context) {
      throw new Error('Failed to get WebGPU canvas context');
    }

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: canvasFormat,
      // The tonemap pass writes linear display-referred values through an sRGB view so the
      // hardware performs the sRGB encode; a view format must be declared at configure time
      // or createView({ format }) is a validation error.
      viewFormats: [this.getSwapchainSrgbViewFormat()],
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    console.log('Canvas configured with format:', canvasFormat);
  }

  /**
   * handle device lost
   */
  private async handleDeviceLost(info: GPUDeviceLostInfo): Promise<void> {
    console.error('Device lost:', info);

    // clean up resources
    this.device = null;
    this.context = null;

    // try to reinitialize
    if (this.canvas) {
      try {
        await this.initialize(this.canvas);
        console.log('WebGPU context reinitialized after device loss');
      } catch (error) {
        console.error('Failed to reinitialize WebGPU context:', error);
      }
    }
  }

  /**
   * get GPU device
   */
  getDevice(): GPUDevice {
    if (!this.device) {
      throw new Error('WebGPU device not initialized');
    }
    return this.device;
  }

  /**
   * get GPU adapter
   */
  getAdapter(): GPUAdapter {
    if (!this.adapter) {
      throw new Error('WebGPU adapter not initialized');
    }
    return this.adapter;
  }

  /**
   * get canvas context
   */
  getContext(): GPUCanvasContext {
    if (!this.context) {
      throw new Error('WebGPU context not initialized');
    }
    return this.context;
  }

  /**
   * get canvas element
   */
  getCanvas(): HTMLCanvasElement {
    if (!this.canvas) {
      throw new Error('Canvas not available');
    }
    return this.canvas;
  }

  /**
   * get canvas format
   */
  getPreferredFormat(): GPUTextureFormat {
    return navigator.gpu.getPreferredCanvasFormat();
  }

  /**
   * sRGB view format of the swapchain, declared in configure() viewFormats. The tonemap
   * pass targets this view: it outputs linear values and the hardware encodes to sRGB.
   */
  getSwapchainSrgbViewFormat(): GPUTextureFormat {
    return `${navigator.gpu.getPreferredCanvasFormat()}-srgb` as GPUTextureFormat;
  }

  /**
   * Format of the HDR intermediate scene-color target. Material pipelines render into this
   * (not the swapchain); the tonemap pass resolves it to the preferred canvas format.
   */
  getSceneColorFormat(): GPUTextureFormat {
    return 'rgba16float';
  }

  /**
   * Format of the sampleable depth texture written by the depth prepass and read by
   * screen-space effects (HGRP depth rim). Depth-only — the forward pass keeps its own
   * depth-stencil attachment.
   */
  getPrepassDepthFormat(): GPUTextureFormat {
    return 'depth24plus';
  }

  /**
   * Depth-stencil format shared by the depth texture and every pipeline drawing in the
   * forward pass (WebGPU validates exact format equality). Stencil is consumed by the HGRP
   * eye compositing; pipelines that ignore it keep the default keep/always stencil state.
   */
  getDepthStencilFormat(): GPUTextureFormat {
    return 'depth24plus-stencil8';
  }

  /**
   * get device features
   */
  getFeatures(): GPUSupportedFeatures | null {
    return this.features;
  }

  /**
   * get device limits
   */
  getLimits(): GPUSupportedLimits | null {
    return this.limits;
  }

  /**
   * check if specific feature is supported
   */
  hasFeature(feature: string): boolean {
    return this.features?.has(feature) || false;
  }

  /**
   * get device info summary
   */
  /**
   * Report the granted limits against what the adapter could have given, so raising a
   * limit is a decision made against real numbers instead of an assumption about the
   * platform. Only the architecture-relevant subset is called out; the full adapter set
   * follows for anything else.
   */
  private logLimits(deviceLimits: GPUSupportedLimits, adapterLimits: GPUSupportedLimits): void {
    const granted = limitsToRecord(deviceLimits);
    const available = limitsToRecord(adapterLimits);
    const headroom = ARCHITECTURE_LIMITS.map((key) => ({
      limit: key,
      granted: granted[key],
      available: available[key],
    }));
    console.log('Limits (granted / adapter maximum):');
    console.table(headroom);
    console.log('Adapter limits (full):', available);
  }

  getDeviceInfo(): {
    name: string;
    vendor: string;
    architecture: string;
    features: string[];
    limits: Record<string, number>;
  } {
    if (!this.adapter || !this.device) {
      throw new Error('Device not initialized');
    }

    return {
      name: this.device.adapterInfo.__brand,
      vendor: this.device.adapterInfo.vendor,
      architecture: this.device.adapterInfo.architecture,
      features: Array.from(this.device.features),
      limits: limitsToRecord(this.device.limits),
    };
  }

  /**
   * destroy context and resources
   */
  destroy(): void {
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }

    this.adapter = null;
    this.context = null;
    this.canvas = null;
    this.features = null;
    this.limits = null;
  }
}
