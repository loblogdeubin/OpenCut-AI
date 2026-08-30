use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DetectAudibleRangesV1Options {
    pub amplitudes: Vec<f64>,
    pub sample_rate: u32,
    pub bucket_size: u32,
    pub total_duration_ticks: i64,
    pub ticks_per_second: i64,
    pub threshold: f64,
    pub min_silence_ticks: i64,
    pub padding_ticks: i64,
    pub min_segment_ticks: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AudibleRangeV1 {
    pub start_ticks: i64,
    pub end_ticks: i64,
}

pub fn detect_audible_ranges(
    options: &DetectAudibleRangesV1Options,
) -> Result<Vec<AudibleRangeV1>, String> {
    if options.sample_rate == 0
        || options.bucket_size == 0
        || options.ticks_per_second <= 0
        || options.total_duration_ticks <= 0
        || options.min_silence_ticks < 0
        || options.padding_ticks < 0
        || options.min_segment_ticks <= 0
        || !options.threshold.is_finite()
        || options.threshold < 0.0
        || options
            .amplitudes
            .iter()
            .any(|amplitude| !amplitude.is_finite() || *amplitude < 0.0)
    {
        return Err("Invalid silence detection options".to_owned());
    }

    let audible_indices = options
        .amplitudes
        .iter()
        .enumerate()
        .filter_map(|(index, amplitude)| (*amplitude >= options.threshold).then_some(index))
        .collect::<Vec<_>>();
    let Some(&first_index) = audible_indices.first() else {
        return Ok(Vec::new());
    };

    let bucket_start = |index: usize| -> i64 {
        ((index as i128)
            .saturating_mul(options.bucket_size as i128)
            .saturating_mul(options.ticks_per_second as i128)
            / options.sample_rate as i128) as i64
    };
    let bucket_end = |index: usize| -> i64 {
        (((index + 1) as i128)
            .saturating_mul(options.bucket_size as i128)
            .saturating_mul(options.ticks_per_second as i128)
            / options.sample_rate as i128) as i64
    };

    let mut groups = Vec::new();
    let mut group_start = first_index;
    let mut group_end = first_index;
    for &index in audible_indices.iter().skip(1) {
        let gap_ticks = bucket_start(index).saturating_sub(bucket_end(group_end));
        if gap_ticks >= options.min_silence_ticks {
            groups.push((group_start, group_end));
            group_start = index;
        }
        group_end = index;
    }
    groups.push((group_start, group_end));

    Ok(groups
        .into_iter()
        .filter_map(|(start_index, end_index)| {
            let raw_start = bucket_start(start_index).max(0);
            let raw_end = bucket_end(end_index).min(options.total_duration_ticks);
            let leading_silence = raw_start;
            let trailing_silence = options.total_duration_ticks.saturating_sub(raw_end);
            let start = if leading_silence >= options.min_silence_ticks {
                raw_start.saturating_sub(options.padding_ticks)
            } else {
                0
            };
            let end = if trailing_silence >= options.min_silence_ticks {
                raw_end
                    .saturating_add(options.padding_ticks)
                    .min(options.total_duration_ticks)
            } else {
                options.total_duration_ticks
            };
            (end.saturating_sub(start) >= options.min_segment_ticks).then_some(AudibleRangeV1 {
                start_ticks: start,
                end_ticks: end,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(amplitudes: Vec<f64>) -> DetectAudibleRangesV1Options {
        DetectAudibleRangesV1Options {
            amplitudes,
            sample_rate: 10,
            bucket_size: 10,
            total_duration_ticks: 8_000,
            ticks_per_second: 1_000,
            threshold: 0.1,
            min_silence_ticks: 2_000,
            padding_ticks: 250,
            min_segment_ticks: 500,
        }
    }

    #[test]
    fn removes_long_silence_and_preserves_short_gaps() {
        let ranges = detect_audible_ranges(&options(vec![0.0, 0.2, 0.0, 0.2, 0.0, 0.0, 0.0, 0.3]))
            .expect("valid options");
        assert_eq!(
            ranges,
            vec![
                AudibleRangeV1 {
                    start_ticks: 0,
                    end_ticks: 4_250,
                },
                AudibleRangeV1 {
                    start_ticks: 6_750,
                    end_ticks: 8_000,
                },
            ]
        );
    }

    #[test]
    fn returns_no_ranges_for_fully_silent_media() {
        assert_eq!(
            detect_audible_ranges(&options(vec![0.0; 8])).expect("valid options"),
            Vec::<AudibleRangeV1>::new()
        );
    }

    #[test]
    fn rejects_non_finite_amplitudes() {
        assert!(detect_audible_ranges(&options(vec![f64::NAN])).is_err());
    }
}
