use serde::Serialize;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorCorrectionSuggestion {
    pub exposure: f32,
    pub contrast: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub temperature: f32,
    pub tint: f32,
    pub saturation: f32,
    pub vibrance: f32,
}

/// Estimates conservative, non-destructive corrections from sparsely sampled RGBA pixels.
/// Callers should sample representative frames at a low resolution to keep analysis cheap.
pub fn suggest_color_correction(rgba: &[u8]) -> ColorCorrectionSuggestion {
    let pixels: Vec<[f32; 3]> = rgba
        .chunks_exact(4)
        .filter(|pixel| pixel[3] > 8)
        .map(|pixel| {
            [
                pixel[0] as f32 / 255.0,
                pixel[1] as f32 / 255.0,
                pixel[2] as f32 / 255.0,
            ]
        })
        .collect();
    if pixels.is_empty() {
        return ColorCorrectionSuggestion::default();
    }

    let count = pixels.len() as f32;
    let mean = pixels.iter().fold([0.0; 3], |mut sum, pixel| {
        sum[0] += pixel[0];
        sum[1] += pixel[1];
        sum[2] += pixel[2];
        sum
    });
    let mean = [mean[0] / count, mean[1] / count, mean[2] / count];
    let mean_luma = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    let variance = pixels
        .iter()
        .map(|pixel| {
            let luma = 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
            (luma - mean_luma).powi(2)
        })
        .sum::<f32>()
        / count;

    let exposure = ((0.48 / mean_luma.max(0.03)).log2() * 0.55).clamp(-1.25, 1.25);
    let contrast = ((0.18 - variance.sqrt()) * 160.0).clamp(-18.0, 24.0);
    let temperature = ((mean[2] - mean[0]) * 45.0).clamp(-18.0, 18.0);
    let tint = (((mean[0] + mean[2]) * 0.5 - mean[1]) * 40.0).clamp(-15.0, 15.0);

    ColorCorrectionSuggestion {
        exposure,
        contrast,
        highlights: if mean_luma > 0.62 { -12.0 } else { 0.0 },
        shadows: if mean_luma < 0.4 { 18.0 } else { 6.0 },
        temperature,
        tint,
        saturation: 4.0,
        vibrance: 12.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifts_a_dark_sample_without_extreme_values() {
        let result = suggest_color_correction(&[20, 24, 28, 255, 35, 40, 45, 255]);
        assert!(result.exposure > 0.0 && result.exposure <= 1.25);
        assert!(result.shadows > 0.0);
    }

    #[test]
    fn ignores_fully_transparent_pixels() {
        assert_eq!(
            suggest_color_correction(&[255, 255, 255, 0]),
            ColorCorrectionSuggestion::default()
        );
    }
}
