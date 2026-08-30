use serde_json::{Number, Value};
use sha2::{Digest, Sha256};

use crate::ProjectContentV1;

pub fn hash_project_content(content: &ProjectContentV1) -> Result<String, serde_json::Error> {
    let mut canonical_value = serde_json::to_value(content)?;
    normalize_negative_zero(&mut canonical_value);
    let canonical_bytes = serde_json::to_vec(&canonical_value)?;
    let digest = Sha256::digest(canonical_bytes);
    Ok(format!("sha256:{digest:x}"))
}

fn normalize_negative_zero(value: &mut Value) {
    match value {
        Value::Number(number) if number.as_f64().is_some_and(|value| value == 0.0) => {
            *number = Number::from(0);
        }
        Value::Array(values) => {
            for value in values {
                normalize_negative_zero(value);
            }
        }
        Value::Object(values) => {
            for value in values.values_mut() {
                normalize_negative_zero(value);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use serde_json::json;

    use super::*;
    use crate::{OutputSettingsV1, PROJECT_CONTENT_SCHEMA_VERSION, ProjectContentV1};

    fn content() -> ProjectContentV1 {
        ProjectContentV1 {
            schema_version: PROJECT_CONTENT_SCHEMA_VERSION.to_owned(),
            current_scene_id: "main".to_owned(),
            settings: OutputSettingsV1 {
                fps_numerator: 30,
                fps_denominator: 1,
                canvas_width: 1920,
                canvas_height: 1080,
                background: BTreeMap::from([
                    ("color".to_owned(), json!("#000000")),
                    ("type".to_owned(), json!("color")),
                ]),
            },
            scenes: Vec::new(),
            media: Vec::new(),
        }
    }

    #[test]
    fn hashing_is_deterministic() {
        let first = content();
        let mut second = content();
        second.settings.background = BTreeMap::from([
            ("type".to_owned(), json!("color")),
            ("color".to_owned(), json!("#000000")),
        ]);

        assert_eq!(
            hash_project_content(&first).unwrap(),
            hash_project_content(&second).unwrap()
        );
    }

    #[test]
    fn rendering_changes_change_the_hash() {
        let first = content();
        let mut second = content();
        second.settings.canvas_width = 1080;

        assert_ne!(
            hash_project_content(&first).unwrap(),
            hash_project_content(&second).unwrap()
        );
    }

    #[test]
    fn negative_zero_hashes_like_zero() {
        let mut first = content();
        first
            .settings
            .background
            .insert("amount".to_owned(), json!(-0.0));
        let mut second = content();
        second
            .settings
            .background
            .insert("amount".to_owned(), json!(0.0));

        assert_eq!(
            hash_project_content(&first).unwrap(),
            hash_project_content(&second).unwrap()
        );
    }
}
