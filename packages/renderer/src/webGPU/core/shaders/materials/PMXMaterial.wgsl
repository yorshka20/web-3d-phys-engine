// PMX Material Shader - Performance Optimized Version
// Supports multiple texture types and PMX-specific features with performance optimizations

// Performance optimization flags
#ifdef ENABLE_TOON_SHADING
override toon_shading: f32 = 1.0;
#else
override toon_shading: f32 = 0.0;
#endif

#ifdef ENABLE_NORMAL_MAPPING
override normal_mapping: f32 = 1.0;
#else
override normal_mapping: f32 = 0.0;
#endif

#ifdef ENABLE_ENVIRONMENT_MAPPING
override environment_mapping: f32 = 1.0;
#else
override environment_mapping: f32 = 0.0;
#endif

#ifdef ENABLE_MORPH_PROCESSING
override morph_processing: f32 = 1.0;
#else
override morph_processing: f32 = 0.0;
#endif


/**
 * vertex shader processing order: 
 * Morph -> Skinning -> World Transform -> Material Data
 */


// PMX Vertex Shader - Modular Functions for Compute Shader Pipeline
// Processing Order: Read Morphed Data → Skinning → World Transform → Material Data
// Uses injected utility functions, only defines processing logic

// Add this binding to your pmx_bindings.wgsl:
// @group(3) @binding(4) var<storage, read> morphed_vertices: array<VertexInput>;

// ============================================================================
// GROUP 1: MORPHED DATA READING
// Read pre-computed morph results from compute shader
// ============================================================================

/**
 * Read morphed vertex data from compute shader output
 */
fn read_morphed_data(
    vertex_index: u32,
    out_position: ptr<function, vec3<f32>>,
    out_normal: ptr<function, vec3<f32>>
) {
    if vertex_index < arrayLength(&morphed_vertices) {
        let morphed_vertex = morphed_vertices[vertex_index];
        *out_position = morphed_vertex.position;
        *out_normal = morphed_vertex.normal;
    } else {
        // Fallback to zero if index out of bounds
        *out_position = vec3<f32>(0.0);
        *out_normal = vec3<f32>(0.0, 1.0, 0.0);
    }
}

// ============================================================================
// GROUP 2: BONE SKINNING PROCESSING
// Apply bone transformations to morphed vertices
// ============================================================================

/**
 * Apply bone skinning to morphed vertex data
 */
fn apply_bone_skinning(
    morphed_position: vec3<f32>,
    morphed_normal: vec3<f32>,
    skin_indices: vec4<f32>,
    skin_weights: vec4<f32>,
    out_position: ptr<function, vec3<f32>>,
    out_normal: ptr<function, vec3<f32>>
) {
    let total_weight = skin_weights.x + skin_weights.y + skin_weights.z + skin_weights.w;

    // Always apply bone skinning, even if weights are low
    // This ensures all vertices are properly transformed
    *out_position = vec3<f32>(0.0);
    *out_normal = vec3<f32>(0.0);

    for (var i = 0u; i < 4u; i++) {
        let weight = skin_weights[i];

        if weight > 0.0 {
            let bone_index = u32(skin_indices[i]);

            if bone_index < arrayLength(&bone_matrices) {
                let bone_matrix = bone_matrices[bone_index];
                *out_position += weight * (bone_matrix * vec4<f32>(morphed_position, 1.0)).xyz;
                *out_normal += weight * (bone_matrix * vec4<f32>(morphed_normal, 0.0)).xyz;
            }
        }
    }

    // Normalize by total weight if it's significant
    if total_weight > 0.001 {
        *out_position /= total_weight;
        *out_normal /= total_weight;
    } else {
        // If no bone weights, use original position (fallback)
        *out_position = morphed_position;
        *out_normal = morphed_normal;
    }

    *out_normal = normalize(*out_normal);
}

// ============================================================================
// GROUP 3: WORLD SPACE TRANSFORMATION
// Transform from model space to world space
// ============================================================================

/**
 * Transform skinned vertex data to world space
 */
fn transform_to_world_space(
    final_position: vec3<f32>,
    final_normal: vec3<f32>,
    out_world_position: ptr<function, vec3<f32>>,
    out_world_normal: ptr<function, vec3<f32>>,
    out_clip_position: ptr<function, vec4<f32>>
) {
    *out_world_position = (mvp.model_matrix * vec4<f32>(final_position, 1.0)).xyz;
    *out_world_normal = normalize((mvp.model_matrix * vec4<f32>(final_normal, 0.0)).xyz);
    *out_clip_position = mvp.mvp_matrix * vec4<f32>(final_position, 1.0);
}

// ============================================================================
// GROUP 4: MATERIAL DATA PREPARATION
// Prepare all data required for material rendering (uses injected utility functions)
// ============================================================================

/**
 * Prepare final vertex output with all material-required data
 * Uses calculate_tangent_space() utility function injected during compilation
 */
fn prepare_material_data(
    world_position: vec3<f32>,
    world_normal: vec3<f32>,
    clip_position: vec4<f32>,
    uv: vec2<f32>
) -> PMXVertexOutput {
    var output: PMXVertexOutput;
    
    // === CRITICAL MATERIAL DATA - DO NOT MODIFY ===
    output.clip_position = clip_position;     // Required for rasterization
    output.world_position = world_position;   // Required for lighting calculations
    output.world_normal = world_normal;       // Required for lighting and normal mapping
    output.uv = uv;                          // Required for texture sampling
    
    // === TANGENT SPACE DATA - Uses injected utility function ===
    let tangent_basis = calculate_tangent_space(world_normal);
    output.world_tangent = tangent_basis[0];
    output.world_bitangent = tangent_basis[1];

    return output;
}

// ============================================================================
// MAIN VERTEX SHADER
// Orchestrates all processing groups in correct order
// ============================================================================

/**
 * Main vertex shader entry point for compute shader pipeline
 * Processing order: Read Morphed Data → Skinning → World Transform → Material Data
 */
@vertex
fn vs_main(input: PMXVertexInput, @builtin(vertex_index) vertex_index: u32) -> PMXVertexOutput {
    // Working variables for each processing group
    var morphed_position: vec3<f32>;
    var morphed_normal: vec3<f32>;
    var final_position: vec3<f32>;
    var final_normal: vec3<f32>;
    var world_position: vec3<f32>;
    var world_normal: vec3<f32>;
    var clip_position: vec4<f32>;

    // GROUP 1: Read pre-computed morph data from compute shader
    // read_morphed_data(vertex_index, &morphed_position, &morphed_normal);
    
    // skip compute shader result.
    // morphed_position = input.position;
    // morphed_normal = input.normal;

    
    // GROUP 1: Handle morphs directly in vertex shader
    // Type 1 (vertex) morphs: Use compute shader result if available
    // Type 2 (bone) morphs: Use original vertex data, applied through bone skinning
    if morph_processing > 0.5 {
        // Try to read from compute shader first (for Type 1 morphs)
        if vertex_index < arrayLength(&morphed_vertices) {
            let morphed_vertex = morphed_vertices[vertex_index];
            morphed_position = morphed_vertex.position;
            morphed_normal = morphed_vertex.normal;
        } else {
            // Fallback to original vertex data
            morphed_position = input.position;
            morphed_normal = input.normal;
        }
    } else {
        // No morph processing, use original vertex data
        morphed_position = input.position;
        morphed_normal = input.normal;
    }


    // GROUP 2: Apply bone skinning to morphed vertices
    apply_bone_skinning(
        morphed_position, morphed_normal,
        input.skin_indices, input.skin_weights,
        &final_position, &final_normal
    );
    
    // GROUP 3: Transform to world space and calculate clip position
    transform_to_world_space(final_position, final_normal, &world_position, &world_normal, &clip_position);
    
    // GROUP 4: Prepare all material-required data (uses injected utilities)
    return prepare_material_data(world_position, world_normal, clip_position, input.uv);
}

@fragment
fn fs_main(input: PMXVertexOutput) -> @location(0) vec4<f32> {
    // 1. basic texture sampling - get the base color of the material
    let diffuse_sample = textureSample(diffuse_texture, diffuse_sampler, input.uv);
    var base_color = pmx_material.diffuse * diffuse_sample;
    
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
    let view_dir = normalize(mvp.camera_pos - input.world_position);
    let n_dot_l = max(dot(final_normal, light_dir), 0.0);
    let n_dot_v = max(dot(final_normal, view_dir), 0.0);

    let ambient = pmx_material.ambient * 1.0;
    let diffuse_strength = max(n_dot_l, 0.3); // ensure minimum brightness, avoid completely dark
    
    // 5. PBR specular calculation - based on physical rendering
    let specular_sample = textureSample(specular_texture, specular_sampler, input.uv);
    let half_dir = normalize(light_dir + view_dir);
    let n_dot_h = max(dot(final_normal, half_dir), 0.0);
    let v_dot_h = max(dot(view_dir, half_dir), 0.0);

    // adjust shininess based on roughness - rough surface has wider specular
    let material_shininess = pmx_material.shininess;
    let roughness_influenced_shininess = material_shininess * (1.0 - roughness * 0.8);
    let adaptive_shininess = select(
        max(roughness_influenced_shininess, 4.0),
        max(roughness_influenced_shininess * 2.0, 16.0),
        material_shininess > 5.0
    );

    // Fresnel reflection - adjust reflection behavior based on metallic
    let F0 = mix(vec3<f32>(0.04), base_color.rgb, metallic); // non-metallic use 0.04, metallic use material color
    let fresnel = F0 + (1.0 - F0) * pow(1.0 - v_dot_h, 5.0);

    let specular_intensity = length(specular_sample.rgb);
    let specular_power = pow(n_dot_h, adaptive_shininess);
    let specular_mask = select(0.0, 1.0, specular_intensity > 0.05);

    // combine PBR specular calculation
    let specular_contribution = fresnel * specular_power * n_dot_l * specular_mask * (1.0 - roughness * 0.5);

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

    return vec4<f32>(final_color, base_color.a * pmx_material.alpha);
}