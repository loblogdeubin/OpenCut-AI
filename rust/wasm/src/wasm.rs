#[cfg(target_arch = "wasm32")]
mod compositor;
#[cfg(target_arch = "wasm32")]
mod editor_contracts;
#[cfg(target_arch = "wasm32")]
mod effects;
#[cfg(target_arch = "wasm32")]
mod gpu;
#[cfg(target_arch = "wasm32")]
mod masks;
#[cfg(target_arch = "wasm32")]
mod perf;

#[cfg(target_arch = "wasm32")]
pub use compositor::*;
#[cfg(target_arch = "wasm32")]
pub use editor_contracts::*;
#[cfg(target_arch = "wasm32")]
pub use effects::*;
#[cfg(target_arch = "wasm32")]
pub use gpu::*;
#[cfg(target_arch = "wasm32")]
pub use masks::*;
#[cfg(target_arch = "wasm32")]
pub use perf::*;
pub use time::*;

#[wasm_bindgen::prelude::wasm_bindgen(js_name = parseLightroomXmp)]
pub fn parse_lightroom_xmp_js(
    source_name: &str,
    xmp: &str,
) -> Result<wasm_bindgen::JsValue, wasm_bindgen::JsValue> {
    let parsed = color_presets::parse_lightroom_xmp(color_presets::ParseLightroomXmpOptions {
        source_name,
        xmp,
    })
    .map_err(|error| wasm_bindgen::JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&parsed)
        .map_err(|error| wasm_bindgen::JsValue::from_str(&error.to_string()))
}
