import { Material3D } from '@ecs/components';
import { CustomShaderDefinition } from '../ShaderManager';
import { PipelineManager } from './PipelineManager';

import checkerboardShader from './shader/checkerboard.wgsl?raw';
import coordinateShader from './shader/coordinate.wgsl?raw';
import emissiveShader from './shader/emissive.wgsl?raw';
import pulsewaveShader from './shader/pulsewave.wgsl?raw';

/**
 * Example: Water Shader with wave animation and fresnel effects
 */
export const waterShaderDefinition: CustomShaderDefinition = {
  id: 'water_shader',
  name: 'Water Shader',
  description: 'Animated water with wave effects and fresnel reflection',

  vertexCode: `
    struct VertexInput {
      @location(0) position: vec3<f32>,
      @location(1) normal: vec3<f32>,
      @location(2) uv: vec2<f32>,
    }
    
    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) worldPos: vec3<f32>,
      @location(1) normal: vec3<f32>,
      @location(2) uv: vec2<f32>,
      @location(3) viewDir: vec3<f32>,
    }
    
    // Fixed bind group indices
    @group(0) @binding(0) var<uniform> timeData: TimeUniforms;           // TIME
    @group(1) @binding(0) var<uniform> mvp: MVPUniforms;                 // MVP
    @group(2) @binding(0) var texture: texture_2d<f32>;            // TEXTURE
    @group(2) @binding(1) var textureSampler: sampler;                    // TEXTURE
    @group(3) @binding(0) var<uniform> material: MaterialUniforms;      // MATERIAL
    
    struct TimeUniforms {
      time: f32,
      deltaTime: f32,
      frameCount: u32,
      padding: u32,
    }
    
    struct MVPUniforms {
      mvpMatrix: mat4x4<f32>,
    }
    
    struct MaterialUniforms {
      albedo: vec4<f32>,
      metallic: f32,
      roughness: f32,
      emissive: vec4<f32>,
      emissiveIntensity: f32,
    }
    
    @vertex
    fn vs_main(input: VertexInput) -> VertexOutput {
      var out: VertexOutput;
      
      // Add wave animation
      let waveOffset = sin(input.position.x * waveFrequency + timeData.time * waveSpeed) * waveAmplitude;
      let worldPos = input.position + vec3<f32>(0.0, waveOffset, 0.0);
      
      out.position = mvp.mvpMatrix * vec4<f32>(worldPos, 1.0);
      out.worldPos = worldPos;
      out.normal = input.normal;
      out.uv = input.uv;
      out.viewDir = normalize(material.albedo.xyz - worldPos);
      
      return out;
    }
  `,

  fragmentCode: `
    struct FragmentInput {
      @location(0) worldPos: vec3<f32>,
      @location(1) normal: vec3<f32>,
      @location(2) uv: vec2<f32>,
      @location(3) viewDir: vec3<f32>,
    }
    
    // Note: waterTexture and waterSampler are now in group(2) as per fixed layout
    
    @fragment
    fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
      // Debug: First test if shader is working at all
      // return vec4<f32>(1.0, 0.0, 0.0, 1.0); // Red
      
      // Debug: Test UV coordinates
      // return vec4<f32>(input.uv, 0.0, 1.0); // UV as color
      
      // Sample water texture with UV animation
      let animatedUV = input.uv + vec2<f32>(timeData.time * 0.1, timeData.time * 0.05);
      let waterColor = textureSample(texture, textureSampler, animatedUV);
      
      // Debug: Return texture color directly to see if texture is working
      return vec4<f32>(waterColor.rgb, 1.0);
    }
  `,

  requiredUniforms: ['timeData', 'mvp'],
  requiredTextures: ['water_texture'],
  supportedVertexFormats: ['full'],
  renderState: {
    blendMode: 'alpha-blend',
    depthTest: true,
    depthWrite: false,
    cullMode: 'none',
  },

  shaderParams: {
    waveFrequency: {
      type: 'f32',
      defaultValue: 0.1,
      description: 'Frequency of wave animation',
    },
    waveSpeed: {
      type: 'f32',
      defaultValue: 1.0,
      description: 'Speed of wave animation',
    },
    waveAmplitude: {
      type: 'f32',
      defaultValue: 0.1,
      description: 'Amplitude of wave animation',
    },
    fresnelPower: {
      type: 'f32',
      defaultValue: 2.0,
      description: 'Power of fresnel effect',
    },
    waterOpacity: {
      type: 'f32',
      defaultValue: 0.8,
      description: 'Opacity of water surface',
    },
  },
};

/**
 * Example: Fire Shader with flickering and distortion effects
 */
export const fireShaderDefinition: CustomShaderDefinition = {
  id: 'fire_shader',
  name: 'Fire Shader',
  description: 'Flickering fire with distortion and color gradients',

  vertexCode: `
    struct VertexInput {
      @location(0) position: vec3<f32>,
      @location(1) normal: vec3<f32>,
      @location(2) uv: vec2<f32>,
    }
    
    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) worldPos: vec3<f32>,
      @location(1) normal: vec3<f32>,
      @location(2) uv: vec2<f32>,
      @location(3) flicker: f32,
    }
    
    @group(0) @binding(0) var<uniform> timeData: TimeUniforms;
    @group(1) @binding(0) var<uniform> mvp: MVPUniforms;
    
    struct TimeUniforms {
      time: f32,
      deltaTime: f32,
      frameCount: u32,
      padding: u32,
    }
    
    struct MVPUniforms {
      mvpMatrix: mat4x4<f32>,
    }
    
    @vertex
    fn vs_main(input: VertexInput) -> VertexOutput {
      var out: VertexOutput;
      
      // Add flickering distortion
      let flicker = sin(timeData.time * flickerSpeed + input.position.x * 10.0) * flickerIntensity;
      let distortedPos = input.position + vec3<f32>(flicker, 0.0, 0.0);
      
      out.position = mvp.mvpMatrix * vec4<f32>(distortedPos, 1.0);
      out.worldPos = distortedPos;
      out.normal = input.normal;
      out.uv = input.uv;
      out.flicker = flicker;
      
      return out;
    }
  `,

  fragmentCode: `
    struct FragmentInput {
      @location(0) worldPos: vec3<f32>,
      @location(1) normal: vec3<f32>,
      @location(2) uv: vec2<f32>,
      @location(3) flicker: f32,
    }
    
    @group(2) @binding(0) var texture: texture_2d<f32>;
    @group(2) @binding(1) var textureSampler: sampler;
    
    @fragment
    fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
      // Debug: Test if fire shader is working
      // return vec4<f32>(0.0, 1.0, 0.0, 1.0); // Green
      
      // Sample fire texture
      let fireColor = textureSample(texture, textureSampler, input.uv);
      
      // Debug: Return texture color directly to see if texture is working
      // If this shows the texture, then the issue is in the original logic
      return vec4<f32>(fireColor.rgb, 1.0);
    }
  `,

  requiredUniforms: ['timeData', 'mvp'],
  requiredTextures: ['fireTexture'],
  supportedVertexFormats: ['full'],
  renderState: {
    blendMode: 'alpha-blend',
    depthTest: true,
    depthWrite: false,
    cullMode: 'none',
  },

  shaderParams: {
    flickerSpeed: {
      type: 'f32',
      defaultValue: 5.0,
      description: 'Speed of flickering animation',
    },
    flickerIntensity: {
      type: 'f32',
      defaultValue: 0.1,
      description: 'Intensity of flickering distortion',
    },
    fireOpacity: {
      type: 'f32',
      defaultValue: 0.9,
      description: 'Opacity of fire effect',
    },
  },
};

/**
 * Example usage: Create materials with custom shaders
 */
export function createWaterMaterial(): Material3D {
  return {
    albedo: { r: 0.1, g: 0.3, b: 0.8, a: 0.8 },
    metallic: 0.0,
    roughness: 0.1,
    emissive: { r: 0, g: 0, b: 0, a: 1 },
    emissiveIntensity: 0,
    alphaMode: 'blend',
    customShaderId: 'water_shader',
    shaderParams: {
      waveFrequency: 0.15,
      waveSpeed: 1.2,
      waveAmplitude: 0.15,
      fresnelPower: 2.5,
      waterOpacity: 0.7,
    },
  };
}

export function createFireMaterial(): Material3D {
  return {
    albedo: { r: 1.0, g: 0.2, b: 0.0, a: 0.9 },
    metallic: 0.0,
    roughness: 0.8,
    emissive: { r: 1.0, g: 0.5, b: 0.0, a: 1 },
    emissiveIntensity: 2.0,
    alphaMode: 'blend',
    customShaderId: 'fire_shader',
    shaderParams: {
      flickerSpeed: 6.0,
      flickerIntensity: 0.15,
      fireOpacity: 0.95,
    },
  };
}

export function setupCustomShaders(pipelineManager: PipelineManager) {
  // Register custom shaders
  pipelineManager.registerCustomShader(waterShaderDefinition);
  pipelineManager.registerCustomShader(fireShaderDefinition);

  pipelineManager.registerCustomShader({
    id: 'checkerboard_shader',
    name: 'Checkerboard Shader',
    description: 'Checkerboard shader',
    vertexCode: checkerboardShader,
    fragmentCode: '',
    requiredUniforms: [],
    requiredTextures: [],
    supportedVertexFormats: ['simple', 'full'],
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
    },
  });
  pipelineManager.registerCustomShader({
    id: 'pulsewave_shader',
    name: 'Pulsewave Shader',
    description: 'Pulsewave shader',
    vertexCode: pulsewaveShader,
    fragmentCode: '',
    requiredUniforms: [],
    requiredTextures: [],
    supportedVertexFormats: ['simple', 'full'],
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
    },
  });
  pipelineManager.registerCustomShader({
    id: 'coordinate_shader',
    name: 'Coordinate Shader',
    description: 'Coordinate shader',
    vertexCode: coordinateShader,
    fragmentCode: '',
    requiredUniforms: [],
    requiredTextures: [],
    supportedVertexFormats: ['simple', 'full'],
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
    },
  });
  pipelineManager.registerCustomShader({
    id: 'emissive_shader',
    name: 'Emissive Shader',
    description: 'Emissive shader',
    vertexCode: emissiveShader,
    fragmentCode: '',
    requiredUniforms: [],
    requiredTextures: [],
    supportedVertexFormats: ['simple', 'full'],
    renderState: {
      blendMode: 'replace',
      depthTest: true,
      depthWrite: true,
      cullMode: 'back',
    },
  });

  console.log('[CustomShaderExample] Custom shaders registered successfully');
}
