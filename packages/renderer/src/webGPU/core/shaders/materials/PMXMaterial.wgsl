// PMX Material Shader - Complete shader with all functionality
// Supports multiple texture types and PMX-specific features

// Shader parameters (can be overridden at runtime)
#ifdef ENABLE_TOON_SHADING
override toonShading: f32 = 1.0;
#else
override toonShading: f32 = 0.0;
#endif

#ifdef ENABLE_NORMAL_MAPPING
override normalMapping: f32 = 1.0;
#else
override normalMapping: f32 = 0.0;
#endif

#ifdef ENABLE_ENVIRONMENT_MAPPING
override environmentMapping: f32 = 1.0;
#else
override environmentMapping: f32 = 0.0;
#endif

// Vertex shader
@vertex
fn vs_main(input: PMXVertexInput) -> PMXVertexOutput {
    var output: PMXVertexOutput;
    
    // use mvp matrix to transform vertex position
    output.clip_position = mvp.mvpMatrix * vec4<f32>(input.position, 1.0);
    
    // calculate world space position
    let world_position_4 = mvp.modelMatrix * vec4<f32>(input.position, 1.0);
    output.world_position = world_position_4.xyz;
    
    // transform normal to world space
    output.world_normal = normalize((mvp.modelMatrix * vec4<f32>(input.normal, 0.0)).xyz);
    
    // since there is no tangent input, use normal to calculate tangent space
    let normal = normalize(input.normal);
    let TBN = calculate_tangent_space(normal);
    
    // transform tangent and bitangent to world space
    let world_tangent_4 = mvp.modelMatrix * vec4<f32>(TBN[0], 0.0);
    let world_bitangent_4 = mvp.modelMatrix * vec4<f32>(TBN[1], 0.0);

    output.world_tangent = normalize(world_tangent_4.xyz);
    output.world_bitangent = normalize(world_bitangent_4.xyz);

    output.uv = input.uv;
    return output;
}


@fragment
fn fs_main(input: PMXVertexOutput) -> @location(0) vec4<f32> {
    // 1. basic texture sampling - get the base color of the material
    let diffuse_sample = textureSample(diffuse_texture, diffuse_sampler, input.uv);
    var base_color = pmxMaterial.diffuse * diffuse_sample;
    
    // 2. normal map processing - calculate the surface detail normal
    var final_normal = normalize(input.world_normal);
    let normal_sample = textureSample(normal_texture, normal_sampler, input.uv);

    // only apply when the normal map has a significant change (to avoid noise)
    if length(normal_sample.rg - vec2<f32>(0.5)) > 0.15 {
        let tangent_normal = normalize(normal_sample.rgb * 2.0 - 1.0);
        let TBN = mat3x3<f32>(
            normalize(input.world_tangent),
            normalize(input.world_bitangent),
            normalize(input.world_normal)
        );
        // mix original normal and tangent space normal, to avoid over strong凹凸效果
        final_normal = normalize(mix(input.world_normal, TBN * tangent_normal, 0.7));
    }

    // 3. PBR material property sampling
    let roughness_sample = textureSample(roughness_texture, roughness_sampler, input.uv);
    let metallic_sample = textureSample(metallic_texture, metallic_sampler, input.uv);
    let emission_sample = textureSample(emission_texture, emission_sampler, input.uv);
    
        // extract material property values - usually stored in different channels of the texture
    let roughness = roughness_sample.r; // roughness is usually stored in R channel
    let metallic = 0.0; // metallic_sample.r;   // metallic is usually stored in R channel
    let emission = emission_sample.rgb; // emission is RGB color

    // 4. basic lighting calculation
    let light_dir = normalize(vec3<f32>(0.5, 0.8, 0.3));
    let view_dir = normalize(mvp.cameraPos - input.world_position);
    let NdotL = max(dot(final_normal, light_dir), 0.0);
    let NdotV = max(dot(final_normal, view_dir), 0.0);

    let ambient = pmxMaterial.ambient * 1.0;
    let diffuse_strength = max(NdotL, 0.3); // ensure minimum brightness, avoid completely dark
    
    // 5. PBR specular calculation - based on physical rendering
    let specular_sample = textureSample(specular_texture, specular_sampler, input.uv);
    let half_dir = normalize(light_dir + view_dir);
    let NdotH = max(dot(final_normal, half_dir), 0.0);
    let VdotH = max(dot(view_dir, half_dir), 0.0);

    // adjust shininess based on roughness - rough surface has wider specular
    let material_shininess = pmxMaterial.shininess;
    let roughness_influenced_shininess = material_shininess * (1.0 - roughness * 0.8);
    let adaptive_shininess = select(
        max(roughness_influenced_shininess, 4.0),
        max(roughness_influenced_shininess * 2.0, 16.0),
        material_shininess > 5.0
    );

    // Fresnel reflection - adjust reflection behavior based on metallic
    let F0 = mix(vec3<f32>(0.04), base_color.rgb, metallic); // non-metallic use 0.04, metallic use material color
    let fresnel = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);

    let specular_intensity = length(specular_sample.rgb);
    let specular_power = pow(NdotH, adaptive_shininess);
    let specular_mask = select(0.0, 1.0, specular_intensity > 0.05);

    // combine PBR specular calculation
    let specular_contribution = fresnel * specular_power * NdotL * specular_mask * (1.0 - roughness * 0.5);

    let base_luminance = dot(base_color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    let specular_scale = select(0.3, 0.1, base_luminance > 0.8);
    
    // 6. metal/non-metal diffuse processing
    // metal material has almost no diffuse, non-metal material has normal diffuse
    let diffuse_factor = 1.0 - metallic; // metallic越高，漫反射越少
    var diffuse_color = base_color.rgb * (ambient + diffuse_strength * 1.2) * diffuse_factor;
    
    // 7. Sphere mapping environment reflection - simulate environment lighting
    let sphere_uv = normalize(reflect(-view_dir, final_normal)).xy * 0.5 + 0.5;
    let sphere_sample = textureSample(sphere_texture, sphere_sampler, sphere_uv);
    
    // mix environment reflection based on metallic and roughness
    let env_reflection = sphere_sample.rgb * fresnel * (1.0 - roughness) * 0.3;
    
    // 8. PMX Toon shading - skip for now
    // comment out toon processing, use standard PBR lighting
    
    // 9. final color composition
    var final_color = diffuse_color + specular_contribution * specular_scale + env_reflection;
    
    // 10. add emission - emission effect that is not affected by lighting
    final_color = final_color + emission * 2.0; // enhance emission effect
    
    // 11. adjust minimum brightness to ensure
    final_color = max(final_color, base_color.rgb * 0.4);
    
    // 12. maintain saturation
    let luminance = dot(final_color, vec3<f32>(0.299, 0.587, 0.114));
    final_color = mix(vec3<f32>(luminance), final_color, 1.0);

    return vec4<f32>(final_color, base_color.a * pmxMaterial.alpha);
}