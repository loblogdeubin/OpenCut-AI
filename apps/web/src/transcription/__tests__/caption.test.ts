import { expect, test } from "bun:test";
import { buildCaptionChunks } from "../caption";

test("groups captions into five words and preserves a silent gap", () => {
	const captions = buildCaptionChunks({
		segments: [
			{ text: "satu dua tiga empat lima enam", start: 1, end: 3 },
			{ text: "tujuh delapan", start: 5, end: 6 },
		],
	});

	expect(captions.map((caption) => caption.text)).toEqual([
		"satu dua tiga empat lima",
		"enam",
		"tujuh delapan",
	]);
	expect(captions[1]?.startTime + (captions[1]?.duration ?? 0)).toBe(3);
	expect(captions[2]?.startTime).toBe(5);
});

test("never extends a caption past the transcription segment", () => {
	const captions = buildCaptionChunks({
		segments: [
			{ text: "satu dua tiga empat lima enam tujuh", start: 0, end: 1 },
		],
		wordsPerChunk: 3,
		minDuration: 0.8,
	});

	expect(captions.at(-1)?.startTime + (captions.at(-1)?.duration ?? 0)).toBe(1);
});
