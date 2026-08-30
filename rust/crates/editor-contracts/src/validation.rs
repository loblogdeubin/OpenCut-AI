use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    EDIT_PLAN_SCHEMA_VERSION, EditOperationV1, EditPlanV1, ElementRefV1, ElementV1,
    MAX_EDIT_OPERATIONS, PROJECT_CONTENT_SCHEMA_VERSION, ProjectSnapshotV1, TrackV1,
    hash_project_content,
};

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidationError {
    pub code: String,
    pub message: String,
    pub operation_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidationResult {
    pub valid: bool,
    pub current_timeline_hash: String,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<String>,
}

pub fn validate_edit_plan(snapshot: &ProjectSnapshotV1, plan: &EditPlanV1) -> ValidationResult {
    let current_timeline_hash = hash_project_content(&snapshot.content)
        .unwrap_or_else(|error| format!("hash-error:{error}"));
    let mut errors = Vec::new();
    let warnings = Vec::new();

    if snapshot.schema_version != PROJECT_CONTENT_SCHEMA_VERSION
        || snapshot.content.schema_version != PROJECT_CONTENT_SCHEMA_VERSION
    {
        push_error(
            &mut errors,
            "UNSUPPORTED_SNAPSHOT_SCHEMA",
            "Project snapshot schema is not supported",
            None,
        );
    }
    if plan.schema_version != EDIT_PLAN_SCHEMA_VERSION {
        push_error(
            &mut errors,
            "UNSUPPORTED_PLAN_SCHEMA",
            "Edit plan schema is not supported",
            None,
        );
    }
    if plan.project_id != snapshot.project_id {
        push_error(
            &mut errors,
            "PROJECT_MISMATCH",
            "Edit plan targets a different project",
            None,
        );
    }
    if plan.base_project_revision != snapshot.revision
        || plan.base_timeline_hash != current_timeline_hash
    {
        push_error(
            &mut errors,
            "PROJECT_STALE",
            "Project revision or timeline hash changed after the plan was created",
            None,
        );
    }
    if plan.plan_id.trim().is_empty() || plan.idempotency_key.trim().is_empty() {
        push_error(
            &mut errors,
            "INVALID_PLAN_IDENTITY",
            "Plan ID and idempotency key are required",
            None,
        );
    }
    if plan.operations.is_empty() || plan.operations.len() > MAX_EDIT_OPERATIONS {
        push_error(
            &mut errors,
            "INVALID_OPERATION_COUNT",
            "Edit plan must contain between 1 and 200 operations",
            None,
        );
    }

    let tracks: HashMap<&str, &TrackV1> = snapshot
        .content
        .scenes
        .iter()
        .flat_map(|scene| scene.tracks.iter())
        .map(|track| (track.id.as_str(), track))
        .collect();
    let elements: HashMap<(&str, &str), &ElementV1> = tracks
        .values()
        .flat_map(|track| {
            track
                .elements
                .iter()
                .map(move |element| ((track.id.as_str(), element.id.as_str()), element))
        })
        .collect();
    let media = snapshot
        .content
        .media
        .iter()
        .map(|asset| (asset.id.as_str(), asset))
        .collect::<HashMap<_, _>>();
    let mut operation_ids = HashSet::new();
    let existing_element_ids = elements
        .keys()
        .map(|(_, element_id)| *element_id)
        .collect::<HashSet<_>>();
    let mut generated_element_ids = HashSet::new();

    for operation in &plan.operations {
        let operation_id = operation.operation_id();
        if operation_id.trim().is_empty() || !operation_ids.insert(operation_id) {
            push_error(
                &mut errors,
                "DUPLICATE_OPERATION_ID",
                "Every operation must have a unique non-empty ID",
                Some(operation_id),
            );
        }

        match operation {
            EditOperationV1::InsertSegment {
                result_element_id,
                media_id,
                target_track_id,
                source_start_ticks,
                source_end_ticks,
                timeline_start_ticks,
                ..
            } => {
                let Some(asset) = media.get(media_id.as_str()) else {
                    push_error(
                        &mut errors,
                        "MEDIA_MISSING",
                        "Insert operation references missing media",
                        Some(operation_id),
                    );
                    continue;
                };
                let Some(track) = tracks.get(target_track_id.as_str()) else {
                    push_error(
                        &mut errors,
                        "TRACK_MISSING",
                        "Insert operation references a missing target track",
                        Some(operation_id),
                    );
                    continue;
                };
                if result_element_id.trim().is_empty()
                    || existing_element_ids.contains(result_element_id.as_str())
                    || !generated_element_ids.insert(result_element_id.as_str())
                {
                    push_error(
                        &mut errors,
                        "DUPLICATE_RESULT_ELEMENT_ID",
                        "Inserted element ID must be unique and predetermined",
                        Some(operation_id),
                    );
                }
                if *source_start_ticks < 0
                    || *source_end_ticks <= *source_start_ticks
                    || *timeline_start_ticks < 0
                {
                    push_error(
                        &mut errors,
                        "INVALID_RANGE",
                        "Insert source and timeline ranges are invalid",
                        Some(operation_id),
                    );
                }
                if asset
                    .duration_ticks
                    .is_some_and(|duration| *source_end_ticks > duration)
                {
                    push_error(
                        &mut errors,
                        "INVALID_RANGE",
                        "Insert source range exceeds media duration",
                        Some(operation_id),
                    );
                }
                if !asset.kind.element_kind().is_compatible_with(track.kind) {
                    push_error(
                        &mut errors,
                        "INCOMPATIBLE_TRACK",
                        "Inserted media is incompatible with the target track",
                        Some(operation_id),
                    );
                }
            }
            EditOperationV1::SplitElements {
                targets,
                split_time_ticks,
                retain_side,
                ..
            } => {
                if targets.is_empty() {
                    push_error(
                        &mut errors,
                        "EMPTY_OPERATION",
                        "Split operation must contain at least one target",
                        Some(operation_id),
                    );
                }
                let mut split_source_ids = HashSet::new();
                for target in targets {
                    let Some(element) = find_element(&elements, &target.element) else {
                        push_missing_element(&mut errors, operation_id);
                        continue;
                    };
                    if !split_source_ids.insert((
                        target.element.track_id.as_str(),
                        target.element.element_id.as_str(),
                    )) {
                        push_error(
                            &mut errors,
                            "DUPLICATE_SPLIT_TARGET",
                            "A split operation cannot target the same element more than once",
                            Some(operation_id),
                        );
                    }
                    let end = element.start_ticks.saturating_add(element.duration_ticks);
                    if *split_time_ticks <= element.start_ticks || *split_time_ticks >= end {
                        push_error(
                            &mut errors,
                            "INVALID_SPLIT_TIME",
                            "Split time must be strictly inside every target element",
                            Some(operation_id),
                        );
                    }
                    validate_split_result_ids(
                        target,
                        *retain_side,
                        &existing_element_ids,
                        &mut generated_element_ids,
                        &mut errors,
                        operation_id,
                    );
                }
            }
            EditOperationV1::TrimElement {
                element,
                trim_start_ticks,
                trim_end_ticks,
                timeline_start_ticks,
                duration_ticks,
                ..
            } => {
                let Some(existing) = find_element(&elements, element) else {
                    push_missing_element(&mut errors, operation_id);
                    continue;
                };
                if *trim_start_ticks < 0
                    || *trim_end_ticks < 0
                    || *timeline_start_ticks < 0
                    || *duration_ticks <= 0
                {
                    push_error(
                        &mut errors,
                        "INVALID_RANGE",
                        "Trim values must be non-negative and duration must be positive",
                        Some(operation_id),
                    );
                }
                if existing
                    .source_duration_ticks
                    .is_some_and(|source_duration| {
                        trim_start_ticks
                            .saturating_add(*duration_ticks)
                            .saturating_add(*trim_end_ticks)
                            > source_duration
                    })
                {
                    push_error(
                        &mut errors,
                        "INVALID_RANGE",
                        "Trim range exceeds the element source duration",
                        Some(operation_id),
                    );
                }
            }
            EditOperationV1::DeleteElements { elements: refs, .. } => {
                validate_refs(&elements, refs, &mut errors, operation_id)
            }
            EditOperationV1::MoveElements { moves, .. } => {
                for move_entry in moves {
                    let Some(element) = find_element(&elements, &move_entry.element) else {
                        push_missing_element(&mut errors, operation_id);
                        continue;
                    };
                    let Some(track) = tracks.get(move_entry.target_track_id.as_str()) else {
                        push_error(
                            &mut errors,
                            "TRACK_MISSING",
                            "Move operation references a missing target track",
                            Some(operation_id),
                        );
                        continue;
                    };
                    if move_entry.timeline_start_ticks < 0 {
                        push_error(
                            &mut errors,
                            "INVALID_RANGE",
                            "Move timeline start must be non-negative",
                            Some(operation_id),
                        );
                    }
                    if !element.kind.is_compatible_with(track.kind) {
                        push_error(
                            &mut errors,
                            "INCOMPATIBLE_TRACK",
                            "Moved element is incompatible with the target track",
                            Some(operation_id),
                        );
                    }
                }
            }
            EditOperationV1::UpdateOutputSettings {
                canvas_width,
                canvas_height,
                fps_numerator,
                fps_denominator,
                ..
            } => {
                if canvas_width.is_some_and(|value| value == 0)
                    || canvas_height.is_some_and(|value| value == 0)
                    || fps_numerator.is_some_and(|value| value == 0)
                    || fps_denominator.is_some_and(|value| value == 0)
                {
                    push_error(
                        &mut errors,
                        "INVALID_OUTPUT_SETTINGS",
                        "Canvas dimensions and frame-rate values must be positive",
                        Some(operation_id),
                    );
                }
            }
        }
    }

    ValidationResult {
        valid: errors.is_empty(),
        current_timeline_hash,
        errors,
        warnings,
    }
}

fn find_element<'a>(
    elements: &'a HashMap<(&str, &str), &ElementV1>,
    element_ref: &ElementRefV1,
) -> Option<&'a ElementV1> {
    elements
        .get(&(
            element_ref.track_id.as_str(),
            element_ref.element_id.as_str(),
        ))
        .copied()
}

fn validate_refs(
    elements: &HashMap<(&str, &str), &ElementV1>,
    refs: &[ElementRefV1],
    errors: &mut Vec<ValidationError>,
    operation_id: &str,
) {
    for element_ref in refs {
        if find_element(elements, element_ref).is_none() {
            push_missing_element(errors, operation_id);
        }
    }
}

fn push_missing_element(errors: &mut Vec<ValidationError>, operation_id: &str) {
    push_error(
        errors,
        "ELEMENT_MISSING",
        "Operation references a missing track or element",
        Some(operation_id),
    );
}

fn validate_split_result_ids<'a>(
    target: &'a crate::SplitTargetV1,
    retain_side: crate::RetainSideV1,
    existing_element_ids: &HashSet<&str>,
    generated_element_ids: &mut HashSet<&'a str>,
    errors: &mut Vec<ValidationError>,
    operation_id: &str,
) {
    let expected_left_id = target.element.element_id.as_str();
    let left_valid = match retain_side {
        crate::RetainSideV1::Both | crate::RetainSideV1::Left => {
            target.left_result_element_id.as_deref() == Some(expected_left_id)
        }
        crate::RetainSideV1::Right => target.left_result_element_id.is_none(),
    };
    if !left_valid {
        push_error(
            errors,
            "INVALID_SPLIT_RESULT_IDS",
            "Retained left split result must preserve the source element ID",
            Some(operation_id),
        );
    }

    let right_id = target.right_result_element_id.as_deref();
    let right_required = matches!(
        retain_side,
        crate::RetainSideV1::Both | crate::RetainSideV1::Right
    );
    if right_required != right_id.is_some() {
        push_error(
            errors,
            "INVALID_SPLIT_RESULT_IDS",
            "Right split result ID must be present exactly when the right side is retained",
            Some(operation_id),
        );
        return;
    }

    if let Some(right_id) = right_id
        && (right_id.trim().is_empty()
            || existing_element_ids.contains(right_id)
            || !generated_element_ids.insert(right_id))
    {
        push_error(
            errors,
            "DUPLICATE_RESULT_ELEMENT_ID",
            "Right split result ID must be non-empty, predetermined, and globally unique",
            Some(operation_id),
        );
    }
}

fn push_error(
    errors: &mut Vec<ValidationError>,
    code: &str,
    message: &str,
    operation_id: Option<&str>,
) {
    errors.push(ValidationError {
        code: code.to_owned(),
        message: message.to_owned(),
        operation_id: operation_id.map(str::to_owned),
    });
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::{
        EditOperationV1, EditPlanV1, ElementKindV1, MediaAssetV1, MediaKindV1, OutputSettingsV1,
        PROJECT_CONTENT_SCHEMA_VERSION, ProjectContentV1, SceneV1, TrackKindV1,
    };

    fn snapshot() -> ProjectSnapshotV1 {
        ProjectSnapshotV1 {
            schema_version: PROJECT_CONTENT_SCHEMA_VERSION.to_owned(),
            project_id: "project".to_owned(),
            revision: 4,
            content: ProjectContentV1 {
                schema_version: PROJECT_CONTENT_SCHEMA_VERSION.to_owned(),
                current_scene_id: "scene".to_owned(),
                settings: OutputSettingsV1 {
                    fps_numerator: 30,
                    fps_denominator: 1,
                    canvas_width: 1920,
                    canvas_height: 1080,
                    background: BTreeMap::new(),
                },
                scenes: vec![SceneV1 {
                    id: "scene".to_owned(),
                    is_main: true,
                    tracks: vec![TrackV1 {
                        id: "main".to_owned(),
                        kind: TrackKindV1::Video,
                        muted: Some(false),
                        hidden: Some(false),
                        elements: vec![ElementV1 {
                            id: "clip".to_owned(),
                            kind: ElementKindV1::Video,
                            media_id: Some("media".to_owned()),
                            start_ticks: 0,
                            duration_ticks: 100,
                            trim_start_ticks: 0,
                            trim_end_ticks: 0,
                            source_duration_ticks: Some(100),
                            semantic_data: BTreeMap::new(),
                        }],
                    }],
                    bookmarks: Vec::new(),
                }],
                media: vec![MediaAssetV1 {
                    id: "media".to_owned(),
                    kind: MediaKindV1::Video,
                    duration_ticks: Some(100),
                    checksum: None,
                }],
            },
        }
    }

    fn plan(snapshot: &ProjectSnapshotV1) -> EditPlanV1 {
        EditPlanV1 {
            schema_version: EDIT_PLAN_SCHEMA_VERSION.to_owned(),
            plan_id: "plan".to_owned(),
            idempotency_key: "key".to_owned(),
            project_id: snapshot.project_id.clone(),
            base_project_revision: snapshot.revision,
            base_timeline_hash: hash_project_content(&snapshot.content).unwrap(),
            operations: vec![EditOperationV1::SplitElements {
                operation_id: "split".to_owned(),
                targets: vec![crate::SplitTargetV1 {
                    element: ElementRefV1 {
                        track_id: "main".to_owned(),
                        element_id: "clip".to_owned(),
                    },
                    left_result_element_id: Some("clip".to_owned()),
                    right_result_element_id: Some("clip-right".to_owned()),
                }],
                split_time_ticks: 50,
                retain_side: crate::RetainSideV1::Both,
            }],
        }
    }

    #[test]
    fn accepts_a_valid_plan() {
        let snapshot = snapshot();
        assert!(validate_edit_plan(&snapshot, &plan(&snapshot)).valid);
    }

    #[test]
    fn rejects_stale_and_invalid_plans_without_panicking() {
        let snapshot = snapshot();
        let mut plan = plan(&snapshot);
        plan.base_timeline_hash = "sha256:stale".to_owned();
        plan.operations = vec![EditOperationV1::SplitElements {
            operation_id: "split".to_owned(),
            targets: vec![crate::SplitTargetV1 {
                element: ElementRefV1 {
                    track_id: "main".to_owned(),
                    element_id: "missing".to_owned(),
                },
                left_result_element_id: Some("missing".to_owned()),
                right_result_element_id: Some("right".to_owned()),
            }],
            split_time_ticks: 0,
            retain_side: crate::RetainSideV1::Both,
        }];

        let result = validate_edit_plan(&snapshot, &plan);
        assert!(!result.valid);
        assert!(
            result
                .errors
                .iter()
                .any(|error| error.code == "PROJECT_STALE")
        );
        assert!(
            result
                .errors
                .iter()
                .any(|error| error.code == "ELEMENT_MISSING")
        );
    }

    #[test]
    fn rejects_nondeterministic_or_colliding_split_result_ids() {
        let snapshot = snapshot();
        let mut plan = plan(&snapshot);
        plan.operations = vec![
            EditOperationV1::SplitElements {
                operation_id: "first-split".to_owned(),
                targets: vec![crate::SplitTargetV1 {
                    element: ElementRefV1 {
                        track_id: "main".to_owned(),
                        element_id: "clip".to_owned(),
                    },
                    left_result_element_id: Some("wrong-left".to_owned()),
                    right_result_element_id: Some("shared-right".to_owned()),
                }],
                split_time_ticks: 50,
                retain_side: crate::RetainSideV1::Both,
            },
            EditOperationV1::SplitElements {
                operation_id: "second-split".to_owned(),
                targets: vec![crate::SplitTargetV1 {
                    element: ElementRefV1 {
                        track_id: "main".to_owned(),
                        element_id: "clip".to_owned(),
                    },
                    left_result_element_id: Some("clip".to_owned()),
                    right_result_element_id: Some("shared-right".to_owned()),
                }],
                split_time_ticks: 50,
                retain_side: crate::RetainSideV1::Both,
            },
        ];

        let result = validate_edit_plan(&snapshot, &plan);
        assert!(!result.valid);
        assert!(
            result
                .errors
                .iter()
                .any(|error| error.code == "INVALID_SPLIT_RESULT_IDS")
        );
        assert!(
            result
                .errors
                .iter()
                .any(|error| error.code == "DUPLICATE_RESULT_ELEMENT_ID")
        );
    }
}
