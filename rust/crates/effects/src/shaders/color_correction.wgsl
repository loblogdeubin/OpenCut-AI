struct VertexOutput { @builtin(position) position: vec4f, @location(0) tex_coord: vec2f, }
struct EffectUniforms { resolution: vec2f, values0: vec2f, values1: vec4f, values2: vec4f, }
@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;
@fragment fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
 let source=textureSample(input_texture,input_sampler,input.tex_coord); let intensity=clamp(uniforms.values2.z,0.0,1.0); if(intensity<=0.0001){return source;}
 var color=source.rgb*exp2(uniforms.values0.x); color=(color-0.5)*(1.0+uniforms.values0.y)+0.5; let luma=dot(color,vec3f(0.2126,0.7152,0.0722));
 color+=uniforms.values1.y*(1.0-smoothstep(0.18,0.58,luma)); color+=uniforms.values1.x*smoothstep(0.48,0.9,luma);
 color+=vec3f(uniforms.values1.z,0.0,-uniforms.values1.z); color+=vec3f(uniforms.values1.w,-uniforms.values1.w,uniforms.values1.w);
 let adjusted_luma=dot(color,vec3f(0.2126,0.7152,0.0722)); let chroma=color-vec3f(adjusted_luma); let vibrance=1.0+uniforms.values2.y*(1.0-clamp(length(chroma)*1.8,0.0,1.0)); color=vec3f(adjusted_luma)+chroma*(1.0+uniforms.values2.x)*vibrance;
 return vec4f(mix(source.rgb,clamp(color,vec3f(0.0),vec3f(1.0)),intensity),source.a);
}
