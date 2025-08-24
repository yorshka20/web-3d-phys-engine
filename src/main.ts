import {
  BufferManager,
  ShaderManager,
  ShaderType,
  WebGPUContext,
} from "./renderer/webGPU";

/**
 * Main application entry point for the WebGPU 3D Physics Engine
 * Basic initialization and canvas setup
 */
class PhysicsEngineApp {
  private canvas: HTMLCanvasElement;
  private context: WebGPUContext | null = null;
  private bufferManager: BufferManager | null = null;
  private shaderManager: ShaderManager | null = null;
  private frameCount: number = 0;

  private get device(): GPUDevice {
    if (!this.context) {
      throw new Error("WebGPU context not initialized");
    }
    return this.context.getDevice();
  }

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error("Canvas element not found");
    }

    const dpr = window.devicePixelRatio;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;

    this.init();
  }

  /**
   * Initialize the application
   */
  private async init(): Promise<void> {
    try {
      // 1. initialize WebGPU context
      this.context = new WebGPUContext();

      await this.context.initialize(this.canvas, {
        powerPreference: "high-performance",
        requiredFeatures: ["timestamp-query"],
        requiredLimits: {
          maxStorageBufferBindingSize: 1024 * 1024 * 64, // 64MB
          maxComputeWorkgroupStorageSize: 32768,
        },
      });

      // 2. create buffer manager
      this.bufferManager = new BufferManager(this.device);

      // 3. create shader manager
      this.shaderManager = new ShaderManager(this.device);

      // 4. display device info
      this.displayDeviceInfo();

      // 5. Set up UI controls
      this.setupControls();

      // 6. Set up scene
      this.setupScene();

      // 7. Start the render loop
      this.render();

      console.log("WebGPU Physics Engine initialized successfully");
    } catch (error) {
      console.error("Failed to initialize physics engine:", error);
      this.showError(
        "Failed to initialize WebGPU. Please check browser compatibility."
      );
    }
  }

  /**
   * Set up UI controls and event listeners
   */
  private setupControls(): void {
    // Gravity control
    const gravitySlider = document.getElementById(
      "gravity"
    ) as HTMLInputElement;
    const gravityValue = document.getElementById(
      "gravityValue"
    ) as HTMLSpanElement;

    gravitySlider.addEventListener("input", (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      gravityValue.textContent = value.toFixed(1);
      console.log("Gravity set to:", value);
    });

    // Object count control
    const objectCountSlider = document.getElementById(
      "objectCountSlider"
    ) as HTMLInputElement;
    const objectCountValue = document.getElementById(
      "objectCountValue"
    ) as HTMLSpanElement;

    objectCountSlider.addEventListener("input", (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      objectCountValue.textContent = value.toString();
    });

    // Add objects button
    const addObjectsBtn = document.getElementById(
      "addObjects"
    ) as HTMLButtonElement;
    addObjectsBtn.addEventListener("click", () => {
      const count = parseInt(objectCountSlider.value);
      console.log("Add objects:", count);
    });

    // Clear objects button
    const clearObjectsBtn = document.getElementById(
      "clearObjects"
    ) as HTMLButtonElement;
    clearObjectsBtn.addEventListener("click", () => {
      console.log("Clear all objects");
    });

    // Pause/Resume button
    const togglePauseBtn = document.getElementById(
      "togglePause"
    ) as HTMLButtonElement;
    togglePauseBtn.addEventListener("click", () => {
      console.log("Toggle pause");
    });

    // Reset button
    const resetBtn = document.getElementById("reset") as HTMLButtonElement;
    resetBtn.addEventListener("click", () => {
      console.log("Reset simulation");
    });

    // Compute pipeline controls
    const runComputeBtn = document.getElementById(
      "runCompute"
    ) as HTMLButtonElement;
    if (runComputeBtn) {
      runComputeBtn.addEventListener("click", () => {
        console.log("Manual compute pipeline execution");
        this.readComputeResults();
      });
    }

    const readResultsBtn = document.getElementById(
      "readResults"
    ) as HTMLButtonElement;
    if (readResultsBtn) {
      readResultsBtn.addEventListener("click", () => {
        console.log("Manual read results");
        this.readComputeResults();
      });
    }

    // Window resize handler
    window.addEventListener("resize", () => {
      this.resize();
    });
  }

  /**
   * Set up the scene
   */
  private setupScene(): void {
    console.log("Setting up scene");

    // 1. create buffers
    this.createBuffers();

    // 2. compile shaders
    this.compileShaders();
  }

  /**
   * Main render loop
   */
  private render(): void {
    if (!this.context || !this.shaderManager) {
      console.warn("WebGPU not initialized");
      return;
    }

    const device = this.device;
    const context = this.context.getContext();

    // create command encoder
    const commandEncoder = device.createCommandEncoder();

    // begin render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    // set render pipeline
    const pipeline = this.shaderManager.getRenderPipeline("example");
    if (pipeline) {
      renderPass.setPipeline(pipeline);

      // set vertex buffer
      if (this.bufferManager) {
        const vertexBuffer =
          this.bufferManager.getVertexBuffer("Triangle Vertices");
        if (vertexBuffer) {
          renderPass.setVertexBuffer(0, vertexBuffer);
        }
      }

      // draw triangle
      renderPass.draw(3, 1, 0, 0);
    }

    renderPass.end();

    // set compute pipeline
    const computePass = commandEncoder.beginComputePass();
    const computePipeline = this.shaderManager.getComputePipeline("example");

    if (computePipeline) {
      computePass.setPipeline(computePipeline);

      // Create and set bind group for compute pipeline
      if (this.bufferManager) {
        const storageBuffer =
          this.bufferManager.getStorageBuffer("Example Storage");
        const bindGroupLayout =
          this.shaderManager.getBindGroupLayout("computeBindGroup");

        if (storageBuffer && bindGroupLayout) {
          const computeBindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
              {
                binding: 0,
                resource: { buffer: storageBuffer },
              },
            ],
            label: "Compute Bind Group",
          });
          computePass.setBindGroup(0, computeBindGroup);
        } else {
          console.warn("Cannot create compute bind group - missing resources");
        }
      }

      computePass.dispatchWorkgroups(1, 1, 1);
    }
    computePass.end();

    // submit command
    device.queue.submit([commandEncoder.finish()]);

    // Read compute pipeline results every few frames
    if (this.frameCount % 60 === 0) {
      // 每60帧读取一次结果
      this.readComputeResults();
    }

    console.log("Example render completed");

    // Update debug UI
    this.updateDebugUI();

    // Increment frame counter
    this.frameCount++;

    // Continue the loop
    requestAnimationFrame(() => this.render());
  }

  /**
   * Read and display compute pipeline results
   */
  private async readComputeResults(): Promise<void> {
    if (!this.bufferManager) return;

    try {
      const storageBuffer =
        this.bufferManager.getStorageBuffer("Example Storage");
      if (storageBuffer) {
        // Read the first 20 elements to see the results
        const result = await this.bufferManager.readBuffer(
          storageBuffer,
          0,
          20 * 4
        ); // 20 floats * 4 bytes
        const resultArray = new Float32Array(result);
        console.log(
          "Compute pipeline results (first 20 elements):",
          resultArray
        );

        // Update UI to show results
        this.updateComputeResults(resultArray);
      }
    } catch (error) {
      console.warn("Failed to read compute results:", error);
    }
  }

  /**
   * Update UI with compute results
   */
  private updateComputeResults(results: Float32Array): void {
    const resultsElement = document.getElementById("computeResults");
    if (resultsElement) {
      const firstFew = results.slice(0, 10).join(", ");
      resultsElement.textContent = `Compute Results: [${firstFew}...]`;
    }
  }

  /**
   * Execute compute pipeline manually
   */
  private async executeComputePipeline(): Promise<void> {
    if (!this.context || !this.shaderManager || !this.bufferManager) {
      console.warn("WebGPU not initialized");
      return;
    }

    try {
      const device = this.device;
      const commandEncoder = device.createCommandEncoder();

      // Execute compute pipeline
      const computePass = commandEncoder.beginComputePass();
      const computePipeline = this.shaderManager.getComputePipeline("example");

      if (computePipeline) {
        computePass.setPipeline(computePipeline);

        // Create and set bind group
        const storageBuffer =
          this.bufferManager.getStorageBuffer("Example Storage");
        const bindGroupLayout =
          this.shaderManager.getBindGroupLayout("computeBindGroup");

        if (storageBuffer && bindGroupLayout) {
          const computeBindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
              {
                binding: 0,
                resource: { buffer: storageBuffer },
              },
            ],
            label: "Manual Compute Bind Group",
          });

          computePass.setBindGroup(0, computeBindGroup);
          computePass.dispatchWorkgroups(1, 1, 1);
          console.log("Manual compute pipeline executed successfully");
        }
      }

      computePass.end();
      device.queue.submit([commandEncoder.finish()]);
    } catch (error) {
      console.error("Failed to execute compute pipeline:", error);
    }
  }

  private displayDeviceInfo(): void {
    if (!this.context) {
      throw new Error("WebGPU context not initialized");
    }

    const deviceInfo = this.context.getDeviceInfo();

    console.log("=== WebGPU Device Information ===");
    console.log(`Name: ${deviceInfo.name}`);
    console.log(`Vendor: ${deviceInfo.vendor}`);
    console.log(`Architecture: ${deviceInfo.architecture}`);
    console.log("Features:", deviceInfo.features);
    console.log("Limits:", deviceInfo.limits);
    console.log("================================");
  }

  private createBuffers() {
    if (!this.context || !this.bufferManager) {
      throw new Error("WebGPU context or buffer manager not initialized");
    }

    console.log("Creating example buffers...");

    // 创建顶点缓冲区
    const vertexData = new Float32Array([
      // 位置 (x, y, z)
      -0.5,
      -0.5,
      0.0, // 左下
      0.5,
      -0.5,
      0.0, // 右下
      0.0,
      0.5,
      0.0, // 顶部
    ]);

    const vertexBuffer = this.bufferManager?.createVertexBuffer(
      vertexData.buffer,
      "Triangle Vertices"
    );

    // 创建索引缓冲区
    const indexData = new Uint16Array([0, 1, 2]);
    // Ensure 4-byte alignment by padding if necessary
    const paddedIndexData =
      indexData.byteLength % 4 === 0
        ? indexData
        : new Uint16Array([...indexData, 0]); // Add padding element if needed

    const indexBuffer = this.bufferManager?.createIndexBuffer(
      paddedIndexData.buffer,
      "Triangle Indices"
    );

    // 创建统一缓冲区 - 暂时不使用，但保留以备将来扩展
    const uniformData = new Float32Array([
      1.0,
      0.0,
      0.0,
      1.0, // 红色
      0.0,
      1.0,
      0.0,
      1.0, // 绿色
      0.0,
      0.0,
      1.0,
      1.0, // 蓝色
    ]);

    const uniformBuffer = this.bufferManager?.createUniformBuffer(
      uniformData.buffer,
      "Color Uniforms"
    );

    // 创建存储缓冲区 - 使用更有趣的初始数据
    const storageData = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) {
      storageData[i] = i * 0.1; // 创建递增的初始值
    }

    // 使用bufferManager创建存储缓冲区（已经包含了COPY_SRC权限）
    const storageBuffer = this.bufferManager?.createStorageBuffer(
      storageData.buffer,
      "Example Storage"
    );

    console.log(
      "Storage buffer created:",
      storageBuffer ? "success" : "failed"
    );
    if (storageBuffer) {
      console.log("Storage buffer size:", storageBuffer.size);
      console.log("Storage buffer usage:", storageBuffer.usage);
      console.log(
        "Initial data (first 10 elements):",
        storageData.slice(0, 10)
      );
    }

    console.log("Example buffers created successfully");
    console.log("Memory usage:", this.bufferManager?.getMemoryUsage());
  }

  private compileShaders() {
    if (!this.context || !this.shaderManager) {
      throw new Error("WebGPU context or shader manager not initialized");
    }

    //  create vertex shader
    const vertexShader = this.shaderManager.createShaderModule(
      "exampleVertex",
      {
        code: `
          struct VertexInput {
            @location(0) position: vec3<f32>
          }

          struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) color: vec4<f32>
          }

          @vertex
          fn main(@location(0) position: vec3<f32>) -> VertexOutput {
            return VertexOutput(
              vec4<f32>(position, 1.0),
              vec4<f32>(position + 0.5, 1.0)
            );
          }
        `,
        type: ShaderType.VERTEX,
        entryPoint: "main",
        label: "Example Vertex Shader",
      }
    );

    //  create fragment shader
    const fragmentShader = this.shaderManager.createShaderModule(
      "exampleFragment",
      {
        code: `
          @fragment
          fn main(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
            return color;
          }
        `,
        type: ShaderType.FRAGMENT,
        entryPoint: "main",
        label: "Example Fragment Shader",
      }
    );

    //  create compute shader
    const computeShader = this.shaderManager.createShaderModule(
      "exampleCompute",
      {
        code: `
          @group(0) @binding(0) var<storage, read_write> data: array<f32>;

          @compute @workgroup_size(64)
          fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let index = id.x;
            if (index < arrayLength(&data)) {
              // 做一些更有趣的计算，让结果更容易看到
              let time = f32(id.x) * 0.1;
              data[index] = sin(time) * cos(time) + f32(index) * 0.01;
            }
          }
        `,
        type: ShaderType.COMPUTE,
        entryPoint: "main",
        label: "Example Compute Shader",
      }
    );

    // create custom bind group layout - create storage buffer layout for compute pipeline
    const computeBindGroupLayout =
      this.shaderManager.createCustomBindGroupLayout("computeBindGroup", {
        entries: [
          {
            binding: 0,
            visibility: 4, // GPUShaderStage.COMPUTE
            buffer: { type: "storage" as GPUBufferBindingType },
          },
        ],
        label: "Compute Bind Group Layout",
      });

    console.log(
      "Compute bind group layout created:",
      computeBindGroupLayout ? "success" : "failed"
    );

    // create render pipeline layout - empty layout because we don't need bind group
    const renderPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [],
      label: "render_pipeline_layout",
    });

    // create compute pipeline layout
    const computePipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
      label: "compute_pipeline_layout",
    });

    // create render pipeline
    this.shaderManager.createRenderPipeline("example", {
      layout: renderPipelineLayout,
      vertex: {
        module: vertexShader,
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 12, // 3 floats * 4 bytes per float
            attributes: [
              {
                format: "float32x3",
                offset: 0,
                shaderLocation: 0,
              },
            ],
          },
        ],
        constants: {},
      },
      fragment: {
        module: fragmentShader,
        entryPoint: "main",
        targets: [
          {
            format: this.context.getPreferredFormat(),
          },
        ],
        constants: {},
      },
      primitive: {
        topology: "triangle-list",
      },
      label: "example_render_pipeline",
    });

    // create compute pipeline
    this.shaderManager.createComputePipeline("example", {
      layout: computePipelineLayout,
      compute: {
        module: computeShader,
        entryPoint: "main",
        constants: {},
      },
      label: "example_compute_pipeline",
    });

    console.log("Compute pipeline created successfully");
  }

  /**
   * Update debug UI with placeholder values
   */
  private updateDebugUI(): void {
    const fpsElement = document.getElementById("fps") as HTMLElement;
    const objectCountElement = document.getElementById(
      "objectCount"
    ) as HTMLElement;
    const memoryElement = document.getElementById("memory") as HTMLElement;

    if (fpsElement) {
      fpsElement.textContent = "60";
    }

    if (objectCountElement) {
      objectCountElement.textContent = "0";
    }

    if (memoryElement) {
      memoryElement.textContent = "0 MB";
    }
  }

  /**
   * Handle window resize
   */
  private resize(): void {
    if (!this.context) return;

    // Update canvas size
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;

    // Reconfigure context
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.getContext().configure({
      device: this.device,
      format: canvasFormat,
      alphaMode: "premultiplied",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
  }

  /**
   * Show error message to user
   */
  private showError(message: string): void {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error";
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
  }
}

// Start the application when the page loads
window.addEventListener("load", () => {
  new PhysicsEngineApp();
});
