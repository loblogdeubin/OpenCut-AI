use quick_xml::{Reader, events::Event};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const MAX_XMP_BYTES: usize = 2 * 1024 * 1024;
const MAX_CURVE_POINTS: usize = 256;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorPresetParams {
    pub exposure: f32,
    pub contrast: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub whites: f32,
    pub blacks: f32,
    pub temperature: f32,
    pub tint: f32,
    pub saturation: f32,
    pub vibrance: f32,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tone_curve: Vec<ToneCurvePoint>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToneCurvePoint {
    pub input: f32,
    pub output: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedColorPreset {
    pub name: String,
    pub params: ColorPresetParams,
}

#[derive(Debug, Error, PartialEq)]
pub enum XmpPresetError {
    #[error("XMP preset is empty")]
    Empty,
    #[error("XMP preset exceeds the 2 MiB safety limit")]
    TooLarge,
    #[error("XMP preset contains a forbidden DTD or entity declaration")]
    UnsafeXml,
    #[error("XMP preset is malformed: {0}")]
    InvalidXml(String),
    #[error("XMP does not contain compatible Lightroom color settings")]
    NoCompatibleSettings,
}

/// Parses only Lightroom/Camera Raw settings OpenCut can reproduce. Unknown XMP
/// fields are deliberately ignored, so importing a preset never executes or
/// resolves data referenced by the document.
pub fn parse_lightroom_xmp(
    options: ParseLightroomXmpOptions<'_>,
) -> Result<ParsedColorPreset, XmpPresetError> {
    let ParseLightroomXmpOptions { source_name, xmp } = options;
    if xmp.trim().is_empty() {
        return Err(XmpPresetError::Empty);
    }
    if xmp.len() > MAX_XMP_BYTES {
        return Err(XmpPresetError::TooLarge);
    }
    let lowercase = xmp.to_ascii_lowercase();
    if lowercase.contains("<!doctype") || lowercase.contains("<!entity") {
        return Err(XmpPresetError::UnsafeXml);
    }

    let mut reader = Reader::from_str(xmp);
    reader.config_mut().trim_text(true);
    let mut params = ColorPresetParams::default();
    let mut name = None;
    let mut found = false;
    let mut in_tone_curve = false;
    let mut in_curve_item = false;
    let mut in_preset_name = false;
    let mut in_name_item = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                let event_name = event.name();
                let local = local_name(event_name.as_ref());
                if local == b"ToneCurvePV2012" || local == b"ToneCurve" {
                    in_tone_curve = true;
                } else if local == b"Name" {
                    in_preset_name = true;
                } else if in_tone_curve && local == b"li" {
                    in_curve_item = true;
                } else if in_preset_name && local == b"li" {
                    in_name_item = true;
                }
                for attr in event.attributes().with_checks(false) {
                    let attr =
                        attr.map_err(|error| XmpPresetError::InvalidXml(error.to_string()))?;
                    let key = local_name(attr.key.as_ref());
                    let value = attr
                        .decode_and_unescape_value(reader.decoder())
                        .map_err(|error| XmpPresetError::InvalidXml(error.to_string()))?;
                    if key == b"Name" || key == b"PresetName" {
                        let candidate = value.trim();
                        if !candidate.is_empty() {
                            name = Some(candidate.chars().take(160).collect());
                        }
                    }
                    found |= assign_param(&mut params, key, &value);
                }
                if event.is_empty() && in_curve_item {
                    in_curve_item = false;
                }
            }
            Ok(Event::Text(text)) if in_tone_curve && in_curve_item => {
                let value = text
                    .decode()
                    .map_err(|error| XmpPresetError::InvalidXml(error.to_string()))?;
                if let Some(point) = parse_curve_point(&value) {
                    if params.tone_curve.len() < MAX_CURVE_POINTS {
                        params.tone_curve.push(point);
                        found = true;
                    }
                }
            }
            Ok(Event::Text(text)) if in_preset_name && in_name_item => {
                let value = text
                    .decode()
                    .map_err(|error| XmpPresetError::InvalidXml(error.to_string()))?;
                let candidate = value.trim();
                if !candidate.is_empty() {
                    name = Some(candidate.chars().take(160).collect());
                }
            }
            Ok(Event::End(event)) => {
                let event_name = event.name();
                let local = local_name(event_name.as_ref());
                if local == b"li" {
                    in_curve_item = false;
                    in_name_item = false;
                } else if local == b"ToneCurvePV2012" || local == b"ToneCurve" {
                    in_tone_curve = false;
                } else if local == b"Name" {
                    in_preset_name = false;
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(XmpPresetError::InvalidXml(error.to_string())),
        }
    }

    if !found {
        return Err(XmpPresetError::NoCompatibleSettings);
    }
    Ok(ParsedColorPreset {
        name: name.unwrap_or_else(|| clean_source_name(source_name)),
        params,
    })
}

pub struct ParseLightroomXmpOptions<'a> {
    pub source_name: &'a str,
    pub xmp: &'a str,
}

fn local_name(name: &[u8]) -> &[u8] {
    name.rsplit(|byte| *byte == b':').next().unwrap_or(name)
}

fn number(value: &str, min: f32, max: f32) -> Option<f32> {
    value
        .trim()
        .trim_start_matches('+')
        .parse::<f32>()
        .ok()
        .filter(|n| n.is_finite())
        .map(|n| n.clamp(min, max))
}

fn assign_param(params: &mut ColorPresetParams, key: &[u8], value: &str) -> bool {
    let target = match key {
        b"Exposure2012" | b"Exposure" => (&mut params.exposure, -5.0, 5.0),
        b"Contrast2012" | b"Contrast" => (&mut params.contrast, -100.0, 100.0),
        b"Highlights2012" | b"Highlights" => (&mut params.highlights, -100.0, 100.0),
        b"Shadows2012" | b"Shadows" => (&mut params.shadows, -100.0, 100.0),
        b"Whites2012" | b"Whites" => (&mut params.whites, -100.0, 100.0),
        b"Blacks2012" | b"Blacks" => (&mut params.blacks, -100.0, 100.0),
        b"Tint" => (&mut params.tint, -150.0, 150.0),
        b"IncrementalTemperature" => (&mut params.temperature, -100.0, 100.0),
        b"IncrementalTint" => (&mut params.tint, -100.0, 100.0),
        b"Saturation" => (&mut params.saturation, -100.0, 100.0),
        b"Vibrance" => (&mut params.vibrance, -100.0, 100.0),
        b"Temperature" => {
            if let Some(kelvin) = number(value, 2_000.0, 50_000.0) {
                // OpenCut's temperature control is a signed creative offset, while
                // Camera Raw stores absolute Kelvin. D65 maps to neutral.
                params.temperature = ((kelvin - 6_500.0) / 45.0).clamp(-100.0, 100.0);
                return true;
            }
            return false;
        }
        _ => return false,
    };
    if let Some(parsed) = number(value, target.1, target.2) {
        *target.0 = parsed;
        true
    } else {
        false
    }
}

fn parse_curve_point(value: &str) -> Option<ToneCurvePoint> {
    let (input, output) = value.split_once(',')?;
    Some(ToneCurvePoint {
        input: number(input, 0.0, 255.0)?,
        output: number(output, 0.0, 255.0)?,
    })
}

fn clean_source_name(source_name: &str) -> String {
    let base = source_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(source_name);
    let base = base
        .strip_suffix(".xmp")
        .or_else(|| base.strip_suffix(".XMP"))
        .unwrap_or(base);
    let cleaned: String = base
        .chars()
        .filter(|ch| !ch.is_control())
        .take(160)
        .collect();
    if cleaned.trim().is_empty() {
        "Imported preset".into()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lightroom_2012_attributes_and_curve() {
        let xmp = r#"<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:rdf="rdf" xmlns:crs="camera">
          <rdf:Description crs:Name="Warm &amp; Clean" crs:Exposure2012="+0.40" crs:Contrast2012="18"
            crs:Highlights2012="-30" crs:Shadows2012="22" crs:Whites2012="5" crs:Blacks2012="-8"
            crs:Temperature="6950" crs:Tint="7" crs:Vibrance="14" crs:Saturation="-3">
            <crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 4</rdf:li><rdf:li>255, 250</rdf:li></rdf:Seq></crs:ToneCurvePV2012>
          </rdf:Description></x:xmpmeta>"#;
        let preset = parse_lightroom_xmp(ParseLightroomXmpOptions {
            source_name: "fallback.xmp",
            xmp,
        })
        .unwrap();
        assert_eq!(preset.name, "Warm & Clean");
        assert_eq!(preset.params.exposure, 0.4);
        assert_eq!(preset.params.temperature, 10.0);
        assert_eq!(preset.params.tone_curve.len(), 2);
    }

    #[test]
    fn rejects_dtd_and_documents_without_supported_settings() {
        assert_eq!(
            parse_lightroom_xmp(ParseLightroomXmpOptions {
                source_name: "x.xmp",
                xmp: "<!DOCTYPE x><x/>"
            }),
            Err(XmpPresetError::UnsafeXml)
        );
        assert_eq!(
            parse_lightroom_xmp(ParseLightroomXmpOptions {
                source_name: "x.xmp",
                xmp: "<x foo='1'/>"
            }),
            Err(XmpPresetError::NoCompatibleSettings)
        );
    }
}
