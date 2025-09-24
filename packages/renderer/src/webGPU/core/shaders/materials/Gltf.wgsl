// Include core constants

// @vertex
// fn vs_main(input: VertexInput) -> VertexOutput {
//     var output: VertexOutput;
    
//     // 骨骼动画变换（如果有权重）
//     var local_position = vec4<f32>(input.position, 1.0);
//     var local_normal = vec4<f32>(input.normal, 0.0);
//     var local_tangent = vec4<f32>(input.tangent.xyz, 0.0);

//     if input.weights_0.x > 0.0 {
//         let skinned_matrix = input.weights_0.x * joints.matrices[input.joints_0.x] + input.weights_0.y * joints.matrices[input.joints_0.y] + input.weights_0.z * joints.matrices[input.joints_0.z] + input.weights_0.w * joints.matrices[input.joints_0.w];

//         local_position = skinned_matrix * local_position;
//         local_normal = skinned_matrix * local_normal;
//         local_tangent = skinned_matrix * local_tangent;
//     }
    
//     // 变换到世界空间
//     let world_position = mvp.model_matrix * local_position;
//     output.world_position = world_position.xyz;
    
//     // 裁剪空间位置
//     output.position = mvp.projection_matrix * mvp.view_matrix * world_position;
    
//     // 变换法线和切线到世界空间
//     output.world_normal = normalize((mvp.normal_matrix * local_normal).xyz);
//     output.world_tangent = normalize((mvp.model_matrix * local_tangent).xyz);
//     output.world_bitangent = cross(output.world_normal, output.world_tangent) * input.tangent.w;
    
//     // 传递UV和颜色
//     output.uv0 = input.texcoord_0;
//     output.uv1 = input.texcoord_1;
//     output.color = input.color_0;

//     return output;
// }

@vertex
fn vs_main(input: GLTFVertexInput) -> GLTFVertexOutput {
    var output: GLTFVertexOutput;
    
    // 直接变换到世界空间（无骨骼动画）
    let world_position = mvp.model_matrix * vec4<f32>(input.position, 1.0);
    output.world_position = world_position.xyz;
    
    // 裁剪空间位置
    output.position = mvp.projection_matrix * mvp.view_matrix * world_position;
    
    // 变换法线和切线到世界空间
    output.world_normal = normalize((mvp.normal_matrix * vec4<f32>(input.normal, 0.0)).xyz);
    
    // 处理切线（如果有的话）
    if length(input.tangent.xyz) > 0.0 {
        output.world_tangent = normalize((mvp.model_matrix * vec4<f32>(input.tangent.xyz, 0.0)).xyz);
        output.world_bitangent = cross(output.world_normal, output.world_tangent) * input.tangent.w;
    } else {
        // 默认切线空间
        output.world_tangent = vec3<f32>(1.0, 0.0, 0.0);
        output.world_bitangent = vec3<f32>(0.0, 0.0, 1.0);
    }
    
    // 传递UV和颜色
    output.uv0 = input.texcoord_0;
    output.uv1 = input.texcoord_1;
    output.color = input.color_0;

    return output;
}

@fragment
fn fs_main(input: GLTFVertexOutput) -> @location(0) vec4<f32> {
    // 采样基础纹理
    var base_color = textureSample(base_color_texture, base_color_sampler, input.uv0);
    base_color = base_color * material.base_color_factor * input.color;
    
    // Alpha测试
    if material.alpha_cutoff > 0.0 && base_color.a < material.alpha_cutoff {
        discard;
    }
    
    // 采样金属粗糙度纹理 (R=未使用, G=粗糙度, B=金属度)
    let metallic_roughness = textureSample(metallic_roughness_texture, metallic_roughness_sampler, input.uv0);
    let metallic = metallic_roughness.b * material.metallic_factor;
    let roughness = metallic_roughness.g * material.roughness_factor;
    
    // 法线贴图
    let normal_sample = textureSample(normal_texture, normal_sampler, input.uv0);
    let normal_map = normalize(normal_sample.xyz * 2.0 - 1.0) * vec3<f32>(material.normal_scale, material.normal_scale, 1.0);
    
    // 构建TBN矩阵，变换法线到世界空间
    let TBN = mat3x3<f32>(
        normalize(input.world_tangent),
        normalize(input.world_bitangent),
        normalize(input.world_normal)
    );
    let world_normal = normalize(TBN * normal_map);
    
    // 遮蔽贴图
    let occlusion = textureSample(occlusion_texture, occlusion_sampler, input.uv0).r;
    let ao = mix(1.0, occlusion, material.occlusion_strength);
    
    // 自发光
    let emissive = textureSample(emissive_texture, emissive_sampler, input.uv0).rgb * material.emissive_factor;
    
    // PBR光照计算
    let view_dir = normalize(mvp.camera_pos - input.world_position);
    
    // 使用多方向光照系统
    let main_light_dir = normalize(MAIN_LIGHT_DIRECTION);
    let fill_light_dir = normalize(FILL_LIGHT_DIRECTION);
    let back_light_dir = normalize(BACK_LIGHT_DIRECTION);
    
    // 主光源计算
    let NdotL_main = max(dot(world_normal, main_light_dir), 0.0);
    let NdotV = max(dot(world_normal, view_dir), 0.0);
    let half_dir_main = normalize(main_light_dir + view_dir);
    let NdotH_main = max(dot(world_normal, half_dir_main), 0.0);
    let VdotH_main = max(dot(view_dir, half_dir_main), 0.0);
    
    // 菲涅尔反射
    let f0 = mix(vec3<f32>(0.04), base_color.rgb, metallic);
    let fresnel = f0 + (1.0 - f0) * pow(1.0 - VdotH_main, 5.0);
    
    // 分布函数（GGX）
    let alpha = roughness * roughness;
    let alpha2 = alpha * alpha;
    let denom = NdotH_main * NdotH_main * (alpha2 - 1.0) + 1.0;
    let distribution = alpha2 / (PI * denom * denom);
    
    // 几何函数（Smith）
    let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    let gl = NdotL_main / (NdotL_main * (1.0 - k) + k);
    let gv = NdotV / (NdotV * (1.0 - k) + k);
    let geometry = gl * gv;
    
    // 镜面反射
    let specular = distribution * geometry * fresnel / (4.0 * NdotL_main * NdotV + 0.001);
    
    // 漫反射
    let kd = (1.0 - fresnel) * (1.0 - metallic);
    let diffuse = kd * base_color.rgb / PI;
    
    // 主光源贡献
    let main_light_contribution = (diffuse + specular) * NdotL_main * MAIN_LIGHT_INTENSITY;
    
    // 补光源贡献（简化计算）
    let NdotL_fill = max(dot(world_normal, fill_light_dir), 0.0);
    let fill_light_contribution = diffuse * NdotL_fill * FILL_LIGHT_INTENSITY;
    
    // 背光源贡献（简化计算）
    let NdotL_back = max(dot(world_normal, back_light_dir), 0.0);
    let back_light_contribution = diffuse * NdotL_back * BACK_LIGHT_INTENSITY;
    
    // 环境光
    let ambient = base_color.rgb * ENVIRONMENT_LIGHT_INTENSITY;
    
    // 最终颜色
    let color = (main_light_contribution + fill_light_contribution + back_light_contribution) * ao + ambient + emissive;

    return vec4<f32>(color, base_color.a);
}