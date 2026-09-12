struct VertexOutput { @builtin(position) position: vec4f, @location(0) tex_coord: vec2f }
struct EffectUniforms { resolution: vec2f, values0: vec2f, values1: vec4f, values2: vec4f }
@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;
@fragment fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
 let source = textureSample(input_texture, input_sampler, input.tex_coord);
 let key = vec3f(uniforms.values0.x, uniforms.values0.y, uniforms.values1.x);
 let distance = length(source.rgb - key);
 let alpha = smoothstep(uniforms.values1.y, uniforms.values1.y + max(uniforms.values1.z, 0.001), distance);
 var rgb = source.rgb;
 rgb.g = mix(min(rgb.g, max(rgb.r, rgb.b) + 0.05), rgb.g, alpha + (1.0 - uniforms.values1.w));
 return vec4f(rgb, source.a * alpha);
}

