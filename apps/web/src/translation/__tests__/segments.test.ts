import { describe, expect, test } from "bun:test";
import { applySegmentTranslations } from "../segments";

describe("applySegmentTranslations", () => {
	test("replaces text while preserving subtitle timing", () => {
		expect(
			applySegmentTranslations({
				segments: [
					{ text: "Hello", start: 1.25, end: 2.5 },
					{ text: "How are you?", start: 2.75, end: 4 },
				],
				translations: ["Halo", "Apa kabar?"],
			}),
		).toEqual([
			{ text: "Halo", start: 1.25, end: 2.5 },
			{ text: "Apa kabar?", start: 2.75, end: 4 },
		]);
	});

	test("rejects incomplete or empty translations", () => {
		const segments = [{ text: "Hello", start: 0, end: 1 }];
		expect(() =>
			applySegmentTranslations({ segments, translations: [] }),
		).toThrow("Jumlah hasil terjemahan");
		expect(() =>
			applySegmentTranslations({ segments, translations: [" "] }),
		).toThrow("Terjemahan segmen 1 kosong");
	});
});
