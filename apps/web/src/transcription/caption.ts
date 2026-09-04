import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import {
	DEFAULT_WORDS_PER_CAPTION,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/transcription/caption-defaults";

export function buildCaptionChunks({
	segments,
	wordsPerChunk = DEFAULT_WORDS_PER_CAPTION,
	minDuration = MIN_CAPTION_DURATION_SECONDS,
}: {
	segments: TranscriptionSegment[];
	wordsPerChunk?: number;
	minDuration?: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];

	for (const segment of segments) {
		const words = segment.text.trim().split(/\s+/);
		if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;

		const segmentDuration = segment.end - segment.start;
		if (!Number.isFinite(segmentDuration) || segmentDuration <= 0) continue;

		const chunks: string[] = [];
		for (let i = 0; i < words.length; i += wordsPerChunk) {
			chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
		}

		let chunkStartTime = segment.start;
		let remainingWords = words.length;
		for (const [index, chunk] of chunks.entries()) {
			const chunkWords = chunk.split(/\s+/).length;
			const remainingDuration = Math.max(0, segment.end - chunkStartTime);
			// Whisper's segment timestamps are the source of truth. Never let the
			// caption spill beyond `segment.end`, otherwise a caption remains visible
			// while the speaker is silent.
			const proportionalDuration =
				remainingDuration * (chunkWords / remainingWords);
			const chunkDuration =
				index === chunks.length - 1
					? remainingDuration
					: Math.min(
							remainingDuration,
							Math.max(minDuration, proportionalDuration),
						);

			captions.push({
				text: chunk,
				startTime: chunkStartTime,
				duration: chunkDuration,
			});

			remainingWords -= chunkWords;
			chunkStartTime += chunkDuration;
		}
	}

	return captions;
}
