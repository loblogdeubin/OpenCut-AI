import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import {
	DEFAULT_WORDS_PER_CAPTION,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/transcription/caption-defaults";

const SILENT_WORD_GAP_SECONDS = 0.45;

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
		if (segment.words && segment.words.length > 0) {
			captions.push(
				...buildWordTimedCaptions({
					words: segment.words,
					wordsPerChunk,
				}),
			);
			continue;
		}

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

function buildWordTimedCaptions({
	words,
	wordsPerChunk,
}: {
	words: NonNullable<TranscriptionSegment["words"]>;
	wordsPerChunk: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	let group: typeof words = [];

	const flush = () => {
		const first = group[0];
		const last = group.at(-1);
		if (!first || !last) return;
		captions.push({
			text: group.map((word) => word.text).join(" "),
			startTime: first.start,
			duration: Math.max(0, last.end - first.start),
		});
		group = [];
	};

	for (const word of words) {
		const previous = group.at(-1);
		const hasSilentGap = previous && word.start - previous.end >= SILENT_WORD_GAP_SECONDS;
		if (hasSilentGap || group.length === wordsPerChunk) flush();
		group.push(word);
	}
	flush();
	return captions;
}
