#![cfg(target_arch = "wasm32")]

use editor_contracts::{
    AudibleRangeV1, DetectAudibleRangesV1Options, EditPlanV1, MediaChecksum, ProjectContentV1,
    ProjectSnapshotV1, ValidationResult, detect_audible_ranges, hash_project_content,
    validate_edit_plan,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

#[wasm_bindgen(js_name = MediaChecksumV1)]
pub struct MediaChecksumV1 {
    inner: MediaChecksum,
}

#[wasm_bindgen(js_class = MediaChecksumV1)]
impl MediaChecksumV1 {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: MediaChecksum::new(),
        }
    }

    pub fn update(&mut self, bytes: &[u8]) -> Result<(), JsValue> {
        self.inner.update(bytes).map_err(JsValue::from_str)
    }

    pub fn finish(&mut self) -> Result<String, JsValue> {
        self.inner.finish().map_err(JsValue::from_str)
    }
}

impl Default for MediaChecksumV1 {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HashProjectContentV1Options {
    content: ProjectContentV1,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ValidateEditPlanV1Options {
    snapshot: ProjectSnapshotV1,
    plan: EditPlanV1,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContractBoundaryErrorV1 {
    code: &'static str,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HashProjectContentV1Result {
    ok: bool,
    hash: Option<String>,
    errors: Vec<ContractBoundaryErrorV1>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidateEditPlanV1Result {
    ok: bool,
    validation: Option<ValidationResult>,
    errors: Vec<ContractBoundaryErrorV1>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectAudibleRangesV1Result {
    ok: bool,
    ranges: Vec<AudibleRangeV1>,
    errors: Vec<ContractBoundaryErrorV1>,
}

/// Hashes the normalized, editor-neutral project content contract.
///
/// Boundary/schema failures are returned as structured data. A JavaScript
/// exception is reserved for an unexpected failure serializing our own result.
#[wasm_bindgen(js_name = hashProjectContentV1)]
pub fn hash_project_content_v1(options: JsValue) -> Result<JsValue, JsValue> {
    let options = match serde_wasm_bindgen::from_value::<HashProjectContentV1Options>(options) {
        Ok(options) => options,
        Err(error) => {
            return serialize_result(&HashProjectContentV1Result {
                ok: false,
                hash: None,
                errors: vec![boundary_error("INVALID_ARGUMENT", error)],
            });
        }
    };

    if options.content.schema_version != editor_contracts::PROJECT_CONTENT_SCHEMA_VERSION {
        return serialize_result(&HashProjectContentV1Result {
            ok: false,
            hash: None,
            errors: vec![ContractBoundaryErrorV1 {
                code: "UNSUPPORTED_SNAPSHOT_SCHEMA",
                message: "Project content schema is not supported".to_owned(),
            }],
        });
    }

    match hash_project_content(&options.content) {
        Ok(hash) => serialize_result(&HashProjectContentV1Result {
            ok: true,
            hash: Some(hash),
            errors: Vec::new(),
        }),
        Err(error) => serialize_result(&HashProjectContentV1Result {
            ok: false,
            hash: None,
            errors: vec![boundary_error("HASH_SERIALIZATION_FAILED", error)],
        }),
    }
}

/// Validates an edit plan against an immutable project snapshot.
///
/// A successfully decoded call has `ok: true` even when the plan itself is
/// invalid; callers inspect `validation.valid` and `validation.errors` for the
/// authoritative plan decision.
#[wasm_bindgen(js_name = validateEditPlanV1)]
pub fn validate_edit_plan_v1(options: JsValue) -> Result<JsValue, JsValue> {
    let options = match serde_wasm_bindgen::from_value::<ValidateEditPlanV1Options>(options) {
        Ok(options) => options,
        Err(error) => {
            return serialize_result(&ValidateEditPlanV1Result {
                ok: false,
                validation: None,
                errors: vec![boundary_error("INVALID_ARGUMENT", error)],
            });
        }
    };

    serialize_result(&ValidateEditPlanV1Result {
        ok: true,
        validation: Some(validate_edit_plan(&options.snapshot, &options.plan)),
        errors: Vec::new(),
    })
}

#[wasm_bindgen(js_name = detectAudibleRangesV1)]
pub fn detect_audible_ranges_v1(options: JsValue) -> Result<JsValue, JsValue> {
    let options = match serde_wasm_bindgen::from_value::<DetectAudibleRangesV1Options>(options) {
        Ok(options) => options,
        Err(error) => {
            return serialize_result(&DetectAudibleRangesV1Result {
                ok: false,
                ranges: Vec::new(),
                errors: vec![boundary_error("INVALID_ARGUMENT", error)],
            });
        }
    };

    match detect_audible_ranges(&options) {
        Ok(ranges) => serialize_result(&DetectAudibleRangesV1Result {
            ok: true,
            ranges,
            errors: Vec::new(),
        }),
        Err(error) => serialize_result(&DetectAudibleRangesV1Result {
            ok: false,
            ranges: Vec::new(),
            errors: vec![boundary_error("INVALID_SILENCE_OPTIONS", error)],
        }),
    }
}

fn boundary_error(code: &'static str, error: impl std::fmt::Display) -> ContractBoundaryErrorV1 {
    ContractBoundaryErrorV1 {
        code,
        message: error.to_string(),
    }
}

fn serialize_result<T: Serialize>(result: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(result).map_err(|error| {
        JsValue::from_str(&format!(
            "Failed to serialize editor contract boundary result: {error}"
        ))
    })
}
