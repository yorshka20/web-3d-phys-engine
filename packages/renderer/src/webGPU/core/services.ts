// Loading the renderer's services.
//
// Each service registers itself with `@Injectable(ServiceTokens.X)` when its class is DEFINED,
// and the container constructs it on first resolve. So there is nothing to instantiate here
// and no order to get right — this module exists only to make sure those class definitions are
// actually evaluated, and to hand the container the two values it cannot build itself.
//
// Deliberately NOT in decorators/index.ts: every manager imports that barrel for its
// decorators, so a barrel that imports the managers back forms a runtime cycle — the same one
// that leaves a decorator undefined at decoration time under Vite SSR (see CLAUDE.md).
import { BindGroupManager } from './BindGroupManager';
import { BufferManager } from './BufferManager';
import { globalContainer, ServiceTokens } from './decorators/DIContainer';
import { GeometryManager } from './GeometryManager';
import { GPUResourceCoordinator } from './GPUResourceCoordinator';
import { MaterialBinder } from './MaterialBinder';
import { MaterialManager } from './MaterialManager';
import { MVPUniformManager } from './MVPUniformManager';
import { PipelineFactory } from './pipeline/PipelineFactory';
import { PipelineManager } from './pipeline/PipelineManager';
import { PMXAnimationBufferManager } from './PMXAnimationBufferManager';
import { PMXMaterialProcessor } from './PMXMaterialProcessor';
import { WebGPUResourceManager } from './ResourceManager';
import { ShaderCompiler } from './shaders/ShaderCompiler';
import { ShaderManager } from './shaders/ShaderManager';
import { ShadingParamsManager } from './ShadingParamsManager';
import { TextureManager } from './TextureManager';
import { TimeManager } from './TimeManager';
import { WebGPUContext } from './WebGPUContext';

/**
 * Referencing the classes is the point: an unused import can be dropped, and a service whose
 * module never loads never registers, which would only show up as a resolve failure at run
 * time. This list is also the answer to "what services exist".
 */
const RENDERER_SERVICES = [
  WebGPUResourceManager,
  GPUResourceCoordinator,
  BufferManager,
  ShaderCompiler,
  ShaderManager,
  TextureManager,
  TimeManager,
  MVPUniformManager,
  MaterialManager,
  MaterialBinder,
  GeometryManager,
  PipelineManager,
  PipelineFactory,
  BindGroupManager,
  ShadingParamsManager,
  PMXMaterialProcessor,
  PMXAnimationBufferManager,
] as const;

export function provideRendererServices(device: GPUDevice, context: WebGPUContext) {
  console.log(`[DI] ${RENDERER_SERVICES.length} services registered, built on first use`);

  // The two the container cannot build: they come from the async WebGPU setup.
  globalContainer.provideValue(ServiceTokens.WEBGPU_DEVICE, device);
  globalContainer.provideValue(ServiceTokens.WEBGPU_CONTEXT, context);

  return globalContainer;
}
