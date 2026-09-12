use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TrackingSample {
    pub time: f64,
    pub x: f64,
    pub y: f64,
    pub confidence: f64,
}

/// Rejects low-confidence detections and smooths the remaining trajectory.
/// Kept here so every UI shell uses the same tracking semantics.
pub fn smooth_tracking_samples(
    samples: &[TrackingSample],
    minimum_confidence: f64,
    smoothing: f64,
) -> Vec<TrackingSample> {
    let alpha = (1.0 - smoothing).clamp(0.01, 1.0);
    let mut result = Vec::new();
    for sample in samples.iter().copied().filter(|s| {
        s.time.is_finite()
            && s.x.is_finite()
            && s.y.is_finite()
            && s.confidence >= minimum_confidence
    }) {
        let next = if let Some(previous) = result.last() {
            TrackingSample {
                time: sample.time,
                x: previous.x + (sample.x - previous.x) * alpha,
                y: previous.y + (sample.y - previous.y) * alpha,
                confidence: sample.confidence,
            }
        } else {
            sample
        };
        result.push(next);
    }
    result
}

/// Alpha for a chroma-key background remover. RGB values are linear 0..1.
pub fn chroma_key_alpha(pixel: [f32; 3], key: [f32; 3], threshold: f32, softness: f32) -> f32 {
    let distance =
        ((pixel[0] - key[0]).powi(2) + (pixel[1] - key[1]).powi(2) + (pixel[2] - key[2]).powi(2))
            .sqrt();
    let low = threshold.max(0.0);
    let high = low + softness.max(0.0001);
    ((distance - low) / (high - low)).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keyed_color_is_transparent() {
        assert_eq!(
            chroma_key_alpha([0.0, 1.0, 0.0], [0.0, 1.0, 0.0], 0.1, 0.1),
            0.0
        );
        assert_eq!(
            chroma_key_alpha([1.0, 0.0, 0.0], [0.0, 1.0, 0.0], 0.1, 0.1),
            1.0
        );
    }

    #[test]
    fn tracking_filters_and_smooths() {
        let samples = [
            TrackingSample {
                time: 0.0,
                x: 0.0,
                y: 0.0,
                confidence: 1.0,
            },
            TrackingSample {
                time: 1.0,
                x: 10.0,
                y: 20.0,
                confidence: 1.0,
            },
            TrackingSample {
                time: 2.0,
                x: 999.0,
                y: 999.0,
                confidence: 0.1,
            },
        ];
        let result = smooth_tracking_samples(&samples, 0.5, 0.5);
        assert_eq!(result.len(), 2);
        assert_eq!((result[1].x, result[1].y), (5.0, 10.0));
    }
}
