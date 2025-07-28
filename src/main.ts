/**
 * Main application entry point for the WebGPU 3D Physics Engine
 * Basic initialization and canvas setup
 */
class PhysicsEngineApp {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;

  constructor() {
    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error("Canvas element not found");
    }

    this.init();
  }

  /**
   * Initialize the application
   */
  private async init(): Promise<void> {
    try {
      // Check WebGPU support
      if (!navigator.gpu) {
        throw new Error("WebGPU not supported");
      }

      // Get GPU adapter
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        throw new Error("No GPU adapter found");
      }

      // Get GPU device
      this.device = await adapter.requestDevice();

      // Get canvas context
      this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
      if (!this.context) {
        throw new Error("WebGPU context not available");
      }

      // Configure canvas format
      const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({
        device: this.device,
        format: canvasFormat,
        alphaMode: "premultiplied",
      });

      // Set up UI controls
      this.setupControls();

      // Start the render loop
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

    // Window resize handler
    window.addEventListener("resize", () => {
      this.resize();
    });
  }

  /**
   * Main render loop
   */
  private render(): void {
    if (!this.device || !this.context) return;

    // Clear the canvas with a dark background
    const commandEncoder = this.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    // Update debug UI
    this.updateDebugUI();

    // Continue the loop
    requestAnimationFrame(() => this.render());
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
    this.context.configure({
      device: this.device!,
      format: canvasFormat,
      alphaMode: "premultiplied",
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
