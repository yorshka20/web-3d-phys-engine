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
    
    // Transform to world space and clip space
    let world_pos = mvp.mvpMatrix * vec4<f32>(input.position, 1.0);
    output.clip_position = world_pos;
    output.world_position = world_pos.xyz;
    
    // Transform normal to world space (simplified version, assuming no non-uniform scaling)
    output.world_normal = normalize(input.normal);
    
    // Calculate tangent space basis vectors (for normal mapping)
    let normal = normalize(input.normal);
    let TBN = calculate_tangent_space(normal);
    output.world_tangent = TBN[0];
    output.world_bitangent = TBN[1];
    
    // Pass UV coordinates
    output.uv = input.uv;

    return output;
}

// Fragment shader
@fragment
fn fs_main(input: PMXVertexOutput) -> @location(0) vec4<f32> {
    // Debug: Test if PMX shader is working
    // return vec4<f32>(1.0, 0.0, 1.0, 1.0); // Magenta - uncomment to test
    
    // Debug: Test UV coordinates
    // return vec4<f32>(input.uv, 0.0, 1.0); // UV as color
    
    // Debug: Test material diffuse color
    // return pmxMaterial.diffuse; // Material diffuse color
    
    // ===== Texture sampling stage =====
    
    // 1. Diffuse color sampling
    var base_color = pmxMaterial.diffuse;
    
    // Sample diffuse texture
    let diffuse_sample = textureSample(diffuse_texture, diffuse_sampler, input.uv);
    base_color = base_color * diffuse_sample;
    
    // 2. Normal mapping (if enabled)
    var final_normal = input.world_normal;
    if normalMapping > 0.5 {
        let normal_sample = textureSample(normal_texture, normal_sampler, input.uv);
        let tangent_normal = unpack_normal_map(normal_sample.xyz);
        
        // Transform from tangent space to world space
        let TBN = mat3x3<f32>(input.world_tangent, input.world_bitangent, input.world_normal);
        final_normal = tangent_to_world(tangent_normal, TBN);
    }
    
    // 3. Lighting calculation
    let light_dir = normalize(vec3<f32>(0.5, 1.0, 0.5));
    let view_dir = normalize(mvp.cameraPos - input.world_position);
    let half_dir = normalize(light_dir + view_dir);

    let NdotL = max(dot(final_normal, light_dir), 0.0);
    let NdotH = max(dot(final_normal, half_dir), 0.0);
    
    // 4. Toon shading (if enabled)
    if toonShading > 0.5 {
        let light_intensity = calculate_light_intensity(final_normal);
        let toon_sample = textureSample(toon_texture, toon_sampler, vec2<f32>(0.5, light_intensity));
        
        // Fixed: Apply toon shading to diffuse using vec4 reconstruction
        base_color = vec4<f32>(base_color.rgb * toon_sample.rgb, base_color.a);
    } else {
        // Standard Phong lighting
        let ambient = pmxMaterial.ambient;
        let diffuse = base_color.rgb * NdotL;
        let specular = pmxMaterial.specular * pow(NdotH, pmxMaterial.shininess);

        // Fixed: Reconstruct vec4 for lighting calculation
        base_color = vec4<f32>(ambient + diffuse + specular, base_color.a);
    }
    
    // 5. Environment mapping (if enabled)
    if environmentMapping > 0.5 && pmxMaterial.envFlag > 0.5 {
        let reflect_dir = reflect(-view_dir, final_normal);
        let env_uv = vec2<f32>(
            atan2(reflect_dir.z, reflect_dir.x) / (2.0 * 3.14159) + 0.5,
            acos(reflect_dir.y) / 3.14159
        );

        let env_sample = textureSample(sphere_texture, sphere_sampler, env_uv);
        
        // Fixed: Apply environment mapping based on sphere mode
        if pmxMaterial.sphereMode > 0.5 {
            // Additive blending
            base_color = vec4<f32>(base_color.rgb + env_sample.rgb * 0.5, base_color.a);
        } else {
            // Multiplicative blending
            base_color = vec4<f32>(base_color.rgb * env_sample.rgb, base_color.a);
        }
    }
    
    // 6. Specular mapping
    let specular_sample = textureSample(specular_texture, specular_sampler, input.uv);
    // Fixed: Reconstruct vec4 for specular addition
    base_color = vec4<f32>(base_color.rgb + specular_sample.rgb * pmxMaterial.specular, base_color.a);
    
    // 7. Alpha handling
    base_color = vec4<f32>(base_color.rgb, base_color.a * pmxMaterial.alpha);

    return base_color;
}