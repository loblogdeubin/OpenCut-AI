use serde::{Deserialize, Serialize};

pub const AUDIO_PLAN_SCHEMA_VERSION: &str = "1.0";
pub const AUDIO_CATALOG_SCHEMA_VERSION: &str = "1.0";
pub const MAX_AUDIO_OPERATIONS: usize = 200;
pub const MIN_AUDIO_GAIN_DB: f64 = -60.0;
pub const MAX_AUDIO_GAIN_DB: f64 = 12.0;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioCatalogV1 {
    pub schema_version: String,
    pub catalog_id: String,
    pub revision: u64,
    pub assets: Vec<AudioCatalogAssetV1>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AudioCatalogAssetKindV1 {
    Music,
    #[serde(rename = "sound-effect")]
    SoundEffect,
    Transition,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioCatalogAssetV1 {
    pub id: String,
    /// ID of the downloaded/cached audio asset in the project snapshot.
    /// It may be absent during preflight and is required before apply.
    pub media_id: Option<String>,
    pub kind: AudioCatalogAssetKindV1,
    pub duration_ticks: i64,
    pub license: AudioLicenseV1,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AudioPlanValidationPhaseV1 {
    /// Validates GPT output and catalog/license references before any download.
    Preflight,
    /// Additionally requires every selected asset to resolve to project audio media.
    ReadyToApply,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioLicenseV1 {
    /// Stable license identifier (for example `CC0-1.0` or a provider license ID).
    pub license_id: String,
    pub license_name: String,
    pub source_url: String,
    pub license_url: String,
    pub creator: String,
    pub attribution_required: bool,
    pub attribution_text: Option<String>,
    pub commercial_use_allowed: bool,
    pub derivative_use_allowed: bool,
    pub review_status: AudioLicenseReviewStatusV1,
    pub reviewed_at: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum AudioLicenseReviewStatusV1 {
    Verified,
    ReviewNeeded,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioPlanV1 {
    pub schema_version: String,
    pub plan_id: String,
    pub idempotency_key: String,
    pub project_id: String,
    pub base_project_revision: u64,
    pub base_timeline_hash: String,
    pub catalog_id: String,
    pub catalog_revision: u64,
    pub operations: Vec<AudioOperationV1>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AudioOperationV1 {
    InsertCatalogAudio {
        operation_id: String,
        result_element_id: String,
        catalog_asset_id: String,
        target_track_id: String,
        timeline_start_ticks: i64,
        source_start_ticks: i64,
        duration_ticks: i64,
        gain_db: f64,
        fade_in_ticks: i64,
        fade_out_ticks: i64,
        ducking: Option<AudioDuckingV1>,
    },
}

impl AudioOperationV1 {
    pub fn operation_id(&self) -> &str {
        match self {
            Self::InsertCatalogAudio { operation_id, .. } => operation_id,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudioDuckingV1 {
    pub enabled: bool,
    /// Gain applied while dialogue is active. Must not amplify the inserted audio.
    pub target_gain_db: f64,
    pub attack_ticks: i64,
    pub release_ticks: i64,
    /// Audio tracks used as the dialogue sidechain. Empty is invalid when enabled.
    pub dialogue_track_ids: Vec<String>,
}
