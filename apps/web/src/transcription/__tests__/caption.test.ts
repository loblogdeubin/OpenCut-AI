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

	const lastCaption = captions.at(-1);
	expect(lastCaption).toBeDefined();
	expect(lastCaption!.startTime + lastCaption!.duration).toBe(1);
});

test("keeps a silent gap between word-timed captions empty", () => {
	const captions = buildCaptionChunks({
		segments: [
			{
				text: "halo lagi",
				start: 0,
				end: 3,
				words: [
					{ text: "halo", start: 0, end: 0.4 },
					{ text: "lagi", start: 2, end: 2.4 },
				],
			},
		],
	});

	expect(captions).toEqual([
		{ text: "halo", startTime: 0, duration: 0.4 },
		{ text: "lagi", startTime: 2, duration: 0.4 },
	]);
});
