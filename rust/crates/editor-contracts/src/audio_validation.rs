use std::collections::{HashMap, HashSet};

use crate::{
    AUDIO_CATALOG_SCHEMA_VERSION, AUDIO_PLAN_SCHEMA_VERSION, AudioCatalogV1,
    AudioLicenseReviewStatusV1, AudioOperationV1, AudioPlanV1, AudioPlanValidationPhaseV1,
    ElementKindV1, MAX_AUDIO_GAIN_DB, MAX_AUDIO_OPERATIONS, MIN_AUDIO_GAIN_DB, MediaKindV1,
    PROJECT_CONTENT_SCHEMA_VERSION, ProjectSnapshotV1, TrackKindV1, ValidationError,
    ValidationResult, hash_project_content,
};

pub fn validate_audio_plan(
    snapshot: &ProjectSnapshotV1,
    catalog: &AudioCatalogV1,
    plan: &AudioPlanV1,
    phase: AudioPlanValidationPhaseV1,
) -> ValidationResult {
    let current_timeline_hash = hash_project_content(&snapshot.content)
        .unwrap_or_else(|error| format!("hash-error:{error}"));
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

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
    if catalog.schema_version != AUDIO_CATALOG_SCHEMA_VERSION {
        push_error(
            &mut errors,
            "UNSUPPORTED_CATALOG_SCHEMA",
            "Audio catalog schema is not supported",
            None,
        );
    }
    if plan.schema_version != AUDIO_PLAN_SCHEMA_VERSION {
        push_error(
            &mut errors,
            "UNSUPPORTED_AUDIO_PLAN_SCHEMA",
            "Audio plan schema is not supported",
            None,
        );
    }
    if plan.project_id != snapshot.project_id {
        push_error(
            &mut errors,
            "PROJECT_MISMATCH",
            "Audio plan targets a different project",
            None,
        );
    }
    if plan.base_project_revision != snapshot.revision
        || plan.base_timeline_hash != current_timeline_hash
    {
        push_error(
            &mut errors,
            "PROJECT_STALE",
            "Project revision or timeline hash changed after the audio plan was created",
            None,
        );
    }
    if plan.catalog_id != catalog.catalog_id || plan.catalog_revision != catalog.revision {
        push_error(
            &mut errors,
            "CATALOG_STALE",
            "Audio catalog ID or revision changed after the audio plan was created",
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
    if catalog.catalog_id.trim().is_empty() {
        push_error(
            &mut errors,
            "INVALID_CATALOG_IDENTITY",
            "Audio catalog ID is required",
            None,
        );
    }
    if plan.operations.is_empty() || plan.operations.len() > MAX_AUDIO_OPERATIONS {
        push_error(
            &mut errors,
            "INVALID_OPERATION_COUNT",
            "Audio plan must contain between 1 and 200 operations",
            None,
        );
    }

    let tracks = snapshot
        .content
        .scenes
        .iter()
        .flat_map(|scene| scene.tracks.iter())
        .map(|track| (track.id.as_str(), track))
        .collect::<HashMap<_, _>>();
    let media = snapshot
        .content
        .media
        .iter()
        .map(|asset| (asset.id.as_str(), asset))
        .collect::<HashMap<_, _>>();
    let existing_element_ids = tracks
        .values()
        .flat_map(|track| track.elements.iter())
        .map(|element| element.id.as_str())
        .collect::<HashSet<_>>();

    let mut catalog_assets = HashMap::new();
    for asset in &catalog.assets {
        if asset.id.trim().is_empty() || catalog_assets.insert(asset.id.as_str(), asset).is_some() {
            push_error(
                &mut errors,
                "INVALID_CATALOG_ASSET_ID",
                "Every catalog asset must have a unique non-empty ID",
                None,
            );
        }
    }

    let mut operation_ids = HashSet::new();
    let mut result_element_ids = HashSet::new();
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
            AudioOperationV1::InsertCatalogAudio {
                result_element_id,
                catalog_asset_id,
                target_track_id,
                timeline_start_ticks,
                source_start_ticks,
                duration_ticks,
                gain_db,
                fade_in_ticks,
                fade_out_ticks,
                ducking,
                ..
            } => {
                if result_element_id.trim().is_empty()
                    || existing_element_ids.contains(result_element_id.as_str())
                    || !result_element_ids.insert(result_element_id.as_str())
                {
                    push_error(
                        &mut errors,
                        "DUPLICATE_RESULT_ELEMENT_ID",
                        "Inserted audio element ID must be non-empty and globally unique",
                        Some(operation_id),
                    );
                }

                let Some(asset) = catalog_assets.get(catalog_asset_id.as_str()) else {
                    push_error(
                        &mut errors,
                        "CATALOG_ASSET_MISSING",
                        "Audio operation references an asset outside the validated catalog",
                        Some(operation_id),
                    );
                    continue;
                };
                validate_license(&asset.license, &mut errors, operation_id);

                if phase == AudioPlanValidationPhaseV1::ReadyToApply {
                    let Some(media_id) = asset
                        .media_id
                        .as_deref()
                        .filter(|media_id| !media_id.trim().is_empty())
                    else {
                        push_error(
                            &mut errors,
                            "MEDIA_UNRESOLVED",
                            "Catalog audio must be downloaded and resolved before insertion",
                            Some(operation_id),
                        );
                        continue;
                    };
                    let Some(project_media) = media.get(media_id) else {
                        push_error(
                            &mut errors,
                            "MEDIA_MISSING",
                            "Resolved catalog audio is missing from the project",
                            Some(operation_id),
                        );
                        continue;
                    };
                    if project_media.kind != MediaKindV1::Audio {
                        push_error(
                            &mut errors,
                            "INCOMPATIBLE_MEDIA",
                            "Catalog asset must resolve to project audio media",
                            Some(operation_id),
                        );
                    }
                }

                if let Some(track) = tracks.get(target_track_id.as_str()) {
                    if track.kind != TrackKindV1::Audio
                        || !ElementKindV1::Audio.is_compatible_with(track.kind)
                    {
                        push_error(
                            &mut errors,
                            "INCOMPATIBLE_TRACK",
                            "Catalog audio can only be inserted into an audio track",
                            Some(operation_id),
                        );
                    }
                } else if phase == AudioPlanValidationPhaseV1::ReadyToApply {
                    push_error(
                        &mut errors,
                        "TRACK_MISSING",
                        "Audio operation references a missing target track",
                        Some(operation_id),
                    );
                } else {
                    warnings.push(format!(
                        "Operation {operation_id} requires audio track {target_track_id} to be materialized before apply"
                    ));
                }

                if *timeline_start_ticks < 0
                    || *source_start_ticks < 0
                    || *duration_ticks <= 0
                    || *source_start_ticks > asset.duration_ticks
                    || duration_ticks
                        .checked_add(*source_start_ticks)
                        .is_none_or(|end| end > asset.duration_ticks)
                {
                    push_error(
                        &mut errors,
                        "INVALID_AUDIO_RANGE",
                        "Audio timing must be positive and remain within the catalog asset",
                        Some(operation_id),
                    );
                }
                if !gain_db.is_finite()
                    || !(MIN_AUDIO_GAIN_DB..=MAX_AUDIO_GAIN_DB).contains(gain_db)
                {
                    push_error(
                        &mut errors,
                        "INVALID_GAIN",
                        "Audio gain must be finite and between -60 dB and +12 dB",
                        Some(operation_id),
                    );
                }
                if *fade_in_ticks < 0
                    || *fade_out_ticks < 0
                    || fade_in_ticks
                        .checked_add(*fade_out_ticks)
                        .is_none_or(|fade_total| fade_total > *duration_ticks)
                {
                    push_error(
                        &mut errors,
                        "INVALID_FADE",
                        "Fade durations must be non-negative and fit inside the audio clip",
                        Some(operation_id),
                    );
                }

                if let Some(ducking) = ducking {
                    if !ducking.target_gain_db.is_finite()
                        || !(-60.0..=0.0).contains(&ducking.target_gain_db)
                        || ducking.attack_ticks < 0
                        || ducking.release_ticks < 0
                    {
                        push_error(
                            &mut errors,
                            "INVALID_DUCKING",
                            "Ducking gain must be between -60 dB and 0 dB with non-negative timing",
                            Some(operation_id),
                        );
                    }
                    if ducking.enabled && ducking.dialogue_track_ids.is_empty() {
                        push_error(
                            &mut errors,
                            "INVALID_DUCKING",
                            "Enabled ducking requires at least one dialogue track",
                            Some(operation_id),
                        );
                    }
                    let mut dialogue_ids = HashSet::new();
                    for dialogue_track_id in &ducking.dialogue_track_ids {
                        let valid_dialogue_track = tracks
                            .get(dialogue_track_id.as_str())
                            .is_some_and(|track| track.kind == TrackKindV1::Audio);
                        if !valid_dialogue_track
                            || !dialogue_ids.insert(dialogue_track_id.as_str())
                            || dialogue_track_id == target_track_id
                        {
                            push_error(
                                &mut errors,
                                "INVALID_DUCKING_TRACK",
                                "Ducking sidechain tracks must be unique, existing audio tracks other than the inserted track",
                                Some(operation_id),
                            );
                        }
                    }
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

fn validate_license(
    license: &crate::AudioLicenseV1,
    errors: &mut Vec<ValidationError>,
    operation_id: &str,
) {
    let attribution_valid = !license.attribution_required
        || license
            .attribution_text
            .as_deref()
            .is_some_and(|text| !text.trim().is_empty());
    let reviewed = license.review_status == AudioLicenseReviewStatusV1::Verified
        && license
            .reviewed_at
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty());
    if license.license_id.trim().is_empty()
        || license.license_name.trim().is_empty()
        || license.creator.trim().is_empty()
        || !is_https_url(&license.source_url)
        || !is_https_url(&license.license_url)
        || !attribution_valid
        || !license.commercial_use_allowed
        || !license.derivative_use_allowed
        || !reviewed
    {
        push_error(
            errors,
            "LICENSE_NOT_USABLE",
            "Catalog audio requires a reviewed, traceable HTTPS license allowing commercial and derivative use, with attribution when required",
            Some(operation_id),
        );
    }
}

fn is_https_url(value: &str) -> bool {
    let value = value.trim();
    value.starts_with("https://") && value.len() > "https://".len()
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
        AUDIO_CATALOG_SCHEMA_VERSION, AUDIO_PLAN_SCHEMA_VERSION, AudioCatalogAssetKindV1,
        AudioCatalogAssetV1, AudioDuckingV1, AudioLicenseV1, ElementV1, MediaAssetV1,
        OutputSettingsV1, PROJECT_CONTENT_SCHEMA_VERSION, ProjectContentV1, SceneV1, TrackV1,
    };

    fn snapshot() -> ProjectSnapshotV1 {
        ProjectSnapshotV1 {
            schema_version: PROJECT_CONTENT_SCHEMA_VERSION.to_owned(),
            project_id: "project".to_owned(),
            revision: 7,
            content: ProjectContentV1 {
                schema_version: PROJECT_CONTENT_SCHEMA_VERSION.to_owned(),
                current_scene_id: "scene".to_owned(),
                settings: OutputSettingsV1 {
                    fps_numerator: 30,
                    fps_denominator: 1,
                    canvas_width: 1080,
                    canvas_height: 1920,
                    background: BTreeMap::new(),
                },
                scenes: vec![SceneV1 {
                    id: "scene".to_owned(),
                    is_main: true,
                    tracks: vec![
                        TrackV1 {
                            id: "music".to_owned(),
                            kind: TrackKindV1::Audio,
                            muted: Some(false),
                            hidden: Some(false),
                            elements: Vec::new(),
                        },
                        TrackV1 {
                            id: "dialogue".to_owned(),
                            kind: TrackKindV1::Audio,
                            muted: Some(false),
                            hidden: Some(false),
                            elements: vec![ElementV1 {
                                id: "voice".to_owned(),
                                kind: ElementKindV1::Audio,
                                media_id: Some("voice-media".to_owned()),
                                start_ticks: 0,
                                duration_ticks: 90_000,
                                trim_start_ticks: 0,
                                trim_end_ticks: 0,
                                source_duration_ticks: Some(90_000),
                                semantic_data: BTreeMap::new(),
                            }],
                        },
                    ],
                    bookmarks: Vec::new(),
                }],
                media: vec![
                    MediaAssetV1 {
                        id: "catalog-media".to_owned(),
                        kind: MediaKindV1::Audio,
                        duration_ticks: Some(180_000),
                        checksum: Some("sha256:catalog".to_owned()),
                    },
                    MediaAssetV1 {
                        id: "voice-media".to_owned(),
                        kind: MediaKindV1::Audio,
                        duration_ticks: Some(90_000),
                        checksum: None,
                    },
                ],
            },
        }
    }

    fn catalog() -> AudioCatalogV1 {
        AudioCatalogV1 {
            schema_version: AUDIO_CATALOG_SCHEMA_VERSION.to_owned(),
            catalog_id: "licensed-starter".to_owned(),
            revision: 3,
            assets: vec![AudioCatalogAssetV1 {
                id: "music-calm".to_owned(),
                media_id: Some("catalog-media".to_owned()),
                kind: AudioCatalogAssetKindV1::Music,
                duration_ticks: 180_000,
                license: AudioLicenseV1 {
                    license_id: "CC0-1.0".to_owned(),
                    license_name: "Creative Commons Zero 1.0".to_owned(),
                    source_url: "https://audio.example/music-calm".to_owned(),
                    license_url: "https://creativecommons.org/publicdomain/zero/1.0/".to_owned(),
                    creator: "Open audio creator".to_owned(),
                    attribution_required: false,
                    attribution_text: None,
                    commercial_use_allowed: true,
                    derivative_use_allowed: true,
                    review_status: AudioLicenseReviewStatusV1::Verified,
                    reviewed_at: Some("2026-09-07T00:00:00Z".to_owned()),
                },
            }],
        }
    }

    fn plan(snapshot: &ProjectSnapshotV1, catalog: &AudioCatalogV1) -> AudioPlanV1 {
        AudioPlanV1 {
            schema_version: AUDIO_PLAN_SCHEMA_VERSION.to_owned(),
            plan_id: "audio-plan".to_owned(),
            idempotency_key: "audio-key".to_owned(),
            project_id: snapshot.project_id.clone(),
            base_project_revision: snapshot.revision,
            base_timeline_hash: hash_project_content(&snapshot.content).unwrap(),
            catalog_id: catalog.catalog_id.clone(),
            catalog_revision: catalog.revision,
            operations: vec![AudioOperationV1::InsertCatalogAudio {
                operation_id: "insert-music".to_owned(),
                result_element_id: "music-element".to_owned(),
                catalog_asset_id: "music-calm".to_owned(),
                target_track_id: "music".to_owned(),
                timeline_start_ticks: 0,
                source_start_ticks: 0,
                duration_ticks: 90_000,
                gain_db: -12.0,
                fade_in_ticks: 3_000,
                fade_out_ticks: 3_000,
                ducking: Some(AudioDuckingV1 {
                    enabled: true,
                    target_gain_db: -20.0,
                    attack_ticks: 500,
                    release_ticks: 2_000,
                    dialogue_track_ids: vec!["dialogue".to_owned()],
                }),
            }],
        }
    }

    #[test]
    fn accepts_a_licensed_catalog_audio_plan() {
        let snapshot = snapshot();
        let catalog = catalog();
        let result = validate_audio_plan(
            &snapshot,
            &catalog,
            &plan(&snapshot, &catalog),
            AudioPlanValidationPhaseV1::ReadyToApply,
        );

        assert!(result.valid, "{:?}", result.errors);
    }

    #[test]
    fn rejects_unknown_assets_and_stale_catalogs() {
        let snapshot = snapshot();
        let catalog = catalog();
        let mut plan = plan(&snapshot, &catalog);
        plan.catalog_revision += 1;
        let AudioOperationV1::InsertCatalogAudio {
            catalog_asset_id, ..
        } = &mut plan.operations[0];
        *catalog_asset_id = "hallucinated".to_owned();

        let result = validate_audio_plan(
            &snapshot,
            &catalog,
            &plan,
            AudioPlanValidationPhaseV1::Preflight,
        );
        assert!(!result.valid);
        assert!(
            result
                .errors
                .iter()
                .any(|error| error.code == "CATALOG_STALE")
        );
        assert!(
            result
                .errors
                .iter()
                .any(|error| error.code == "CATALOG_ASSET_MISSING")
        );
    }

    #[test]
    fn rejects_unsafe_license_timing_gain_fade_and_ducking() {
        let snapshot = snapshot();
        let mut catalog = catalog();
        catalog.assets[0].license.commercial_use_allowed = false;
        catalog.assets[0].license.attribution_required = true;
        catalog.assets[0].license.review_status = AudioLicenseReviewStatusV1::ReviewNeeded;
        let mut plan = plan(&snapshot, &catalog);
        let AudioOperationV1::InsertCatalogAudio {
            source_start_ticks,
            duration_ticks,
            gain_db,
            fade_in_ticks,
            fade_out_ticks,
            ducking,
            ..
        } = &mut plan.operations[0];
        *source_start_ticks = 179_000;
        *duration_ticks = 10_000;
        *gain_db = 24.0;
        *fade_in_ticks = 8_000;
        *fade_out_ticks = 8_000;
        *ducking = Some(AudioDuckingV1 {
            enabled: true,
            target_gain_db: 2.0,
            attack_ticks: -1,
            release_ticks: 0,
            dialogue_track_ids: vec!["music".to_owned()],
        });

        let result = validate_audio_plan(
            &snapshot,
            &catalog,
            &plan,
            AudioPlanValidationPhaseV1::Preflight,
        );
        for expected in [
            "LICENSE_NOT_USABLE",
            "INVALID_AUDIO_RANGE",
            "INVALID_GAIN",
            "INVALID_FADE",
            "INVALID_DUCKING",
            "INVALID_DUCKING_TRACK",
        ] {
            assert!(
                result.errors.iter().any(|error| error.code == expected),
                "missing {expected}: {:?}",
                result.errors
            );
        }
    }

    #[test]
    fn rejects_catalog_media_that_is_not_ready_or_is_not_audio() {
        let mut snapshot = snapshot();
        let catalog = catalog();
        snapshot.content.media[0].kind = MediaKindV1::Video;
        let mut plan = plan(&snapshot, &catalog);
        plan.base_timeline_hash = hash_project_content(&snapshot.content).unwrap();

        let result = validate_audio_plan(
            &snapshot,
            &catalog,
            &plan,
            AudioPlanValidationPhaseV1::ReadyToApply,
        );
        assert!(
            result
                .errors
                .iter()
                .any(|error| error.code == "INCOMPATIBLE_MEDIA")
        );

        snapshot.content.media.remove(0);
        plan.base_timeline_hash = hash_project_content(&snapshot.content).unwrap();
        let result = validate_audio_plan(
            &snapshot,
            &catalog,
            &plan,
            AudioPlanValidationPhaseV1::ReadyToApply,
        );
        assert!(
            result
                .errors
                .iter()
                .any(|error| error.code == "MEDIA_MISSING")
        );
    }

    #[test]
    fn preflight_allows_remote_asset_then_final_validation_requires_resolution() {
        let snapshot = snapshot();
        let mut catalog = catalog();
        catalog.assets[0].media_id = None;
        let plan = plan(&snapshot, &catalog);

        let preflight = validate_audio_plan(
            &snapshot,
            &catalog,
            &plan,
            AudioPlanValidationPhaseV1::Preflight,
        );
        assert!(preflight.valid, "{:?}", preflight.errors);

        let ready = validate_audio_plan(
            &snapshot,
            &catalog,
            &plan,
            AudioPlanValidationPhaseV1::ReadyToApply,
        );
        assert!(!ready.valid);
        assert!(
            ready
                .errors
                .iter()
                .any(|error| error.code == "MEDIA_UNRESOLVED")
        );
    }

    #[test]
    fn preflight_allows_a_planned_audio_track_but_final_validation_requires_it() {
        let snapshot = snapshot();
        let catalog = catalog();
        let mut plan = plan(&snapshot, &catalog);
        let AudioOperationV1::InsertCatalogAudio {
            target_track_id, ..
        } = &mut plan.operations[0];
        *target_track_id = "ai-music".to_owned();

        let preflight = validate_audio_plan(
            &snapshot,
            &catalog,
            &plan,
            AudioPlanValidationPhaseV1::Preflight,
        );
        assert!(preflight.valid, "{:?}", preflight.errors);
        assert_eq!(preflight.warnings.len(), 1);

        let ready = validate_audio_plan(
            &snapshot,
            &catalog,
            &plan,
            AudioPlanValidationPhaseV1::ReadyToApply,
        );
        assert!(
            ready
                .errors
                .iter()
                .any(|error| error.code == "TRACK_MISSING")
        );
    }
}
