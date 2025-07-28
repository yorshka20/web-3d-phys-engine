// Jest test setup file
// Configure test environment for WebGPU physics engine

// Mock WebGPU APIs for testing
Object.defineProperty(navigator, "gpu", {
  value: {
    requestAdapter: jest.fn(),
    getPreferredCanvasFormat: jest.fn(() => "bgra8unorm"),
  },
  writable: true,
});

// Mock canvas context for WebGPU
const mockCanvasContext = {
  configure: jest.fn(),
  getCurrentTexture: jest.fn(() => ({
    createView: jest.fn(),
  })),
};

// Mock getContext method
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: jest.fn(() => mockCanvasContext),
  writable: true,
});

// Note: Console mocking can be enabled by uncommenting the following lines:
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
