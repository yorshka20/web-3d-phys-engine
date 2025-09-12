import { CustomShaderDefinition } from '../ShaderManager';

/**
 * PMX Material Shader Definition - Supports multiple texture types and PMX-specific features
 * Based on the material-texture.md design document and following CustomShaderExample pattern
 */
export const pmxMaterialShaderDefinition: CustomShaderDefinition = {
  id: 'pmx_material_shader',
  name: 'PMX Material Shader',
  description: 'PMX model material shader with multi-texture support and PMX-specific features',

  vertexCode: `
    struct VertexInput {
      @location(0) position: vec3<f32>,
      @location(1) normal: vec3<f32>,
      @location(2) uv: vec2<f32>,
      @location(3) tangent: vec4<f32>,  // 切线空间用于法线贴图
    }
    
    struct VertexOutput {
      @builtin(position) clip_position: vec4<f32>,
      @location(0) world_position: vec3<f32>,
      @location(1) world_normal: vec3<f32>,
      @location(2) uv: vec2<f32>,
      @location(3) world_tangent: vec3<f32>,
      @location(4) world_bitangent: vec3<f32>,
    }
    

    struct TimeUniforms {
      time: f32,
      deltaTime: f32,
      frameCount: u32,
      padding: u32,
    }
    
    struct MVPUniforms {
      mvpMatrix: mat4x4<f32>,
    }
    
    struct PMXMaterialUniforms {
      diffuse: vec4<f32>,
      specular: vec3<f32>,
      shininess: f32,
      ambient: vec3<f32>,
      edgeColor: vec4<f32>,
      edgeSize: f32,
      alpha: f32,
      toonFlag: f32,
      envFlag: f32,
      sphereMode: f32,
      padding: f32,
    }

    struct FragmentInput {
      @location(0) world_position: vec3<f32>,
      @location(1) world_normal: vec3<f32>,
      @location(2) uv: vec2<f32>,
      @location(3) world_tangent: vec3<f32>,
      @location(4) world_bitangent: vec3<f32>,
    }

    
    // Fixed bind group indices following PipelineManager pattern
    @group(0) @binding(0) var<uniform> timeData: TimeUniforms;           // TIME
    @group(1) @binding(0) var<uniform> mvp: MVPUniforms;                 // MVP
    @group(2) @binding(0) var<uniform> material: PMXMaterialUniforms;    // MATERIAL (using group 2 for PMX)
    
    // PMX Material Textures - using group(2) for consistency
    @group(2) @binding(1) var diffuse_texture: texture_2d<f32>;
    @group(2) @binding(2) var diffuse_sampler: sampler;
    
    @group(2) @binding(3) var normal_texture: texture_2d<f32>;
    @group(2) @binding(4) var normal_sampler: sampler;
    
    @group(2) @binding(5) var specular_texture: texture_2d<f32>;
    @group(2) @binding(6) var specular_sampler: sampler;
    
    @group(2) @binding(7) var sphere_texture: texture_2d<f32>;
    @group(2) @binding(8) var sphere_sampler: sampler;
    
    @group(2) @binding(9) var toon_texture: texture_2d<f32>;
    @group(2) @binding(10) var toon_sampler: sampler;
    

    
    @vertex
    fn vs_main(input: VertexInput) -> VertexOutput {
      var output: VertexOutput;
      
      // 变换到世界空间和裁剪空间
      let world_pos = mvp.mvpMatrix * vec4<f32>(input.position, 1.0);
      output.clip_position = world_pos;
      output.world_position = world_pos.xyz;
      
      // 变换法线到世界空间 (简化版本，假设没有非均匀缩放)
      output.world_normal = normalize(input.normal);
      
      // 计算切线空间基向量（用于法线贴图）
      output.world_tangent = normalize(input.tangent.xyz);
      output.world_bitangent = cross(output.world_normal, output.world_tangent) * input.tangent.w;
      
      // 传递UV坐标
      output.uv = input.uv;
      
      return output;
    }
  `,

  fragmentCode: `
    // Toon渲染的光照强度计算
    fn calculate_light_intensity(normal: vec3<f32>) -> f32 {
      let light_dir = normalize(vec3<f32>(0.5, 1.0, 0.5));
      let ndotl = dot(normal, light_dir);
      
      // 将光照强度映射到toon纹理的V坐标
      return clamp((ndotl + 1.0) * 0.5, 0.0, 1.0);
    }
    
    // 法线贴图解压缩
    fn unpack_normal_map(normal_sample: vec3<f32>) -> vec3<f32> {
      // 常见的法线贴图格式处理
      return normalize(normal_sample * 2.0 - 1.0);
    }
    
    @fragment
    fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
      // Debug: Test if PMX shader is working
      // return vec4<f32>(1.0, 0.0, 1.0, 1.0); // Magenta
      
      // ===== 纹理采样阶段 =====
      
      // 1. 漫反射颜色采样
      var base_color = material.diffuse;
      
      // Sample diffuse texture
      let diffuse_sample = textureSample(diffuse_texture, diffuse_sampler, input.uv);
      base_color = base_color * diffuse_sample;
      
      // 2. 法线贴图处理
      var world_normal = normalize(input.world_normal);
      
      // Sample normal texture
      let normal_sample = textureSample(normal_texture, normal_sampler, input.uv);
      
      // 将法线从[0,1]转换到[-1,1]
      let tangent_normal = unpack_normal_map(normal_sample.xyz);
      
      // 构建TBN矩阵
      let T = normalize(input.world_tangent);
      let B = normalize(input.world_bitangent);
      let N = normalize(input.world_normal);
      let TBN = mat3x3<f32>(T, B, N);
      
      // 转换到世界空间
      world_normal = normalize(TBN * tangent_normal);
      
      // 3. 高光信息采样
      var specular_intensity = material.specular;
      
      // Sample specular texture
      let specular_sample = textureSample(specular_texture, specular_sampler, input.uv);
      specular_intensity = specular_intensity * specular_sample.rgb;
      
      // 4. 环境映射处理 (PMX sphere mapping)
      if (material.envFlag > 0.0) {
        let sphere_sample = textureSample(sphere_texture, sphere_sampler, input.uv);
        
        // Simple multiply blend for now
        base_color = vec4<f32>(base_color.rgb * sphere_sample.rgb, base_color.a);
      }
      
      // ===== 光照计算阶段 =====
      
      // 基础光照参数
      let light_dir = normalize(vec3<f32>(0.5, 1.0, 0.5)); // 简化的光照方向
      let view_dir = normalize(-input.world_position); // 简化的视角方向
      let halfway = normalize(light_dir + view_dir);
      
      // Lambert漫反射
      let ndotl = max(dot(world_normal, light_dir), 0.0);
      let diffuse = base_color.rgb * vec3<f32>(1.0, 1.0, 1.0) * ndotl; // 简化的光照颜色
      
      // Blinn-Phong高光
      let ndoth = max(dot(world_normal, halfway), 0.0);
      let specular = specular_intensity * vec3<f32>(1.0, 1.0, 1.0) * pow(ndoth, material.shininess);
      
      // 环境光
      let ambient = material.ambient * base_color.rgb * 0.3;
      
      // 5. Toon渲染处理
      var final_lighting = 1.0;
      if (material.toonFlag > 0.0) {
        let light_intensity = calculate_light_intensity(world_normal);
        let toon_sample = textureSample(toon_texture, toon_sampler, vec2<f32>(0.0, light_intensity));
        final_lighting = toon_sample.r;
      }
      
      // 最终颜色合成
      let final_color = (ambient + diffuse + specular) * final_lighting;
      
      return vec4<f32>(final_color, base_color.a * material.alpha);
    }
  `,

  requiredUniforms: ['timeData', 'mvp'],
  requiredTextures: ['pmx_diffuse', 'pmx_normal', 'pmx_specular', 'pmx_sphere', 'pmx_toon'],
  supportedVertexFormats: ['full'],
  renderState: {
    blendMode: 'alpha-blend',
    depthTest: true,
    depthWrite: true,
    cullMode: 'back',
  },

  shaderParams: {
    toonShading: {
      type: 'f32',
      defaultValue: 0.0,
      description: 'Enable toon shading effect',
    },
    environmentMapping: {
      type: 'f32',
      defaultValue: 0.0,
      description: 'Enable environment mapping',
    },
    sphereMode: {
      type: 'f32',
      defaultValue: 0.0,
      description: 'Sphere mapping mode',
    },
  },
};

/**
 * Create PMX material shader module (legacy function for backward compatibility)
 */
export function createPMXMaterialShader(device: GPUDevice): GPUShaderModule {
  const shaderCode = `${pmxMaterialShaderDefinition.vertexCode}\n\n${pmxMaterialShaderDefinition.fragmentCode}`;

  return device.createShaderModule({
    code: shaderCode,
    label: 'PMXMaterialShader',
  });
}
