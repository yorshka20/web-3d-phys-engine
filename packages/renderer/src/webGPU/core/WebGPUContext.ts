import { ServiceTokens } from './decorators/DIContainer';
import { Injectable } from './decorators/ResourceDecorators';
import { WebGPUContextOptions } from './types';

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
      await this.requestAdapter(options);

      // 2. request GPU device
      await this.requestDevice(options.requiredFeatures);

      // 3. configure canvas context
      await this.configureCanvas();

      console.log('WebGPU context initialized successfully');
      console.log('Device:', this.device);
      console.log('Features:', this.features);
      console.log('Limits:', this.limits);
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
   * @param requiredFeatures required features
   * @returns GPU device
   */
  private async requestDevice(
    requiredFeatures?: GPUDeviceDescriptor['requiredFeatures'],
  ): Promise<GPUDevice> {
    if (!this.adapter) {
      throw new Error('No adapter available');
    }

    const deviceOptions: GPUDeviceDescriptor = {
      label: 'WebGPU Device',
      requiredFeatures: requiredFeatures ? new Set(requiredFeatures) : undefined,
      requiredLimits: {},
    };

    const device = await this.adapter.requestDevice(deviceOptions);
    if (!device) {
      throw new Error('Failed to create GPU device');
    }

    this.device = device;

    // handle device lost
    this.device.lost.then(this.handleDeviceLost);

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
      limits: Object.fromEntries(
        Object.entries(this.device.limits).map(([key, value]) => [key, value]),
      ),
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
