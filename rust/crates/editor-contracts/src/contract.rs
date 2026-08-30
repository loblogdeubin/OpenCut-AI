use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const EDIT_PLAN_SCHEMA_VERSION: &str = "1.0";
pub const PROJECT_CONTENT_SCHEMA_VERSION: &str = "1.0";
pub const MAX_EDIT_OPERATIONS: usize = 200;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectSnapshotV1 {
    pub schema_version: String,
    pub project_id: String,
    pub revision: u64,
    pub content: ProjectContentV1,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectContentV1 {
    pub schema_version: String,
    pub current_scene_id: String,
    pub settings: OutputSettingsV1,
    pub scenes: Vec<SceneV1>,
    pub media: Vec<MediaAssetV1>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputSettingsV1 {
    pub fps_numerator: u32,
    pub fps_denominator: u32,
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub background: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SceneV1 {
    pub id: String,
    pub is_main: bool,
    pub tracks: Vec<TrackV1>,
    pub bookmarks: Vec<BookmarkV1>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BookmarkV1 {
    pub time_ticks: i64,
    pub duration_ticks: Option<i64>,
    pub note: Option<String>,
    pub color: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TrackKindV1 {
    Video,
    Text,
    Audio,
    Graphic,
    Effect,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrackV1 {
    pub id: String,
    pub kind: TrackKindV1,
    pub muted: Option<bool>,
    pub hidden: Option<bool>,
    pub elements: Vec<ElementV1>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ElementKindV1 {
    Video,
    Image,
    Audio,
    Text,
    Sticker,
    Graphic,
    Effect,
}

impl ElementKindV1 {
    pub fn is_compatible_with(self, track: TrackKindV1) -> bool {
        matches!(
            (self, track),
            (Self::Video | Self::Image, TrackKindV1::Video)
                | (Self::Audio, TrackKindV1::Audio)
                | (Self::Text, TrackKindV1::Text)
                | (Self::Sticker | Self::Graphic, TrackKindV1::Graphic)
                | (Self::Effect, TrackKindV1::Effect)
        )
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementV1 {
    pub id: String,
    pub kind: ElementKindV1,
    pub media_id: Option<String>,
    pub start_ticks: i64,
    pub duration_ticks: i64,
    pub trim_start_ticks: i64,
    pub trim_end_ticks: i64,
    pub source_duration_ticks: Option<i64>,
    pub semantic_data: BTreeMap<String, Value>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MediaKindV1 {
    Video,
    Image,
    Audio,
}

impl MediaKindV1 {
    pub fn element_kind(self) -> ElementKindV1 {
        match self {
            Self::Video => ElementKindV1::Video,
            Self::Image => ElementKindV1::Image,
            Self::Audio => ElementKindV1::Audio,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MediaAssetV1 {
    pub id: String,
    pub kind: MediaKindV1,
    pub duration_ticks: Option<i64>,
    pub checksum: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditPlanV1 {
    pub schema_version: String,
    pub plan_id: String,
    pub idempotency_key: String,
    pub project_id: String,
    pub base_project_revision: u64,
    pub base_timeline_hash: String,
    pub operations: Vec<EditOperationV1>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum EditOperationV1 {
    InsertSegment {
        operation_id: String,
        result_element_id: String,
        media_id: String,
        target_track_id: String,
        source_start_ticks: i64,
        source_end_ticks: i64,
        timeline_start_ticks: i64,
    },
    SplitElements {
        operation_id: String,
        targets: Vec<SplitTargetV1>,
        split_time_ticks: i64,
        retain_side: RetainSideV1,
    },
    TrimElement {
        operation_id: String,
        element: ElementRefV1,
        trim_start_ticks: i64,
        trim_end_ticks: i64,
        timeline_start_ticks: i64,
        duration_ticks: i64,
    },
    DeleteElements {
        operation_id: String,
        elements: Vec<ElementRefV1>,
    },
    MoveElements {
        operation_id: String,
        moves: Vec<ElementMoveV1>,
    },
    UpdateOutputSettings {
        operation_id: String,
        canvas_width: Option<u32>,
        canvas_height: Option<u32>,
        fps_numerator: Option<u32>,
        fps_denominator: Option<u32>,
    },
}

impl EditOperationV1 {
    pub fn operation_id(&self) -> &str {
        match self {
            Self::InsertSegment { operation_id, .. }
            | Self::SplitElements { operation_id, .. }
            | Self::TrimElement { operation_id, .. }
            | Self::DeleteElements { operation_id, .. }
            | Self::MoveElements { operation_id, .. }
            | Self::UpdateOutputSettings { operation_id, .. } => operation_id,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementRefV1 {
    pub track_id: String,
    pub element_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementMoveV1 {
    pub element: ElementRefV1,
    pub target_track_id: String,
    pub timeline_start_ticks: i64,
}

/// Declares the stable IDs produced by a split before the plan is applied.
///
/// The current editor preserves the source element ID for a retained left side,
/// while a retained right side receives a new ID. Making both outcomes explicit
/// keeps replay and idempotency independent from random IDs generated by a UI
/// command implementation.
#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SplitTargetV1 {
    pub element: ElementRefV1,
    pub left_result_element_id: Option<String>,
    pub right_result_element_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RetainSideV1 {
    Both,
    Left,
    Right,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn split_contract_uses_explicit_camel_case_result_ids() {
        let operation: EditOperationV1 = serde_json::from_value(json!({
            "type": "split_elements",
            "operationId": "split-1",
            "targets": [{
                "element": { "trackId": "track-1", "elementId": "clip-1" },
                "leftResultElementId": "clip-1",
                "rightResultElementId": "clip-1-right"
            }],
            "splitTimeTicks": 60000,
            "retainSide": "both"
        }))
        .unwrap();

        let EditOperationV1::SplitElements { targets, .. } = operation else {
            panic!("expected a split operation");
        };
        assert_eq!(targets[0].left_result_element_id.as_deref(), Some("clip-1"));
        assert_eq!(
            targets[0].right_result_element_id.as_deref(),
            Some("clip-1-right")
        );
    }

    #[test]
    fn split_contract_rejects_legacy_implicit_result_ids() {
        let result = serde_json::from_value::<EditOperationV1>(json!({
            "type": "split_elements",
            "operationId": "split-1",
            "elements": [{ "trackId": "track-1", "elementId": "clip-1" }],
            "splitTimeTicks": 60000,
            "retainSide": "both"
        }));

        assert!(result.is_err());
    }
}
