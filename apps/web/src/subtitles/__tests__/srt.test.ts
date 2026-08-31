import { describe, expect, test } from "bun:test";
import { parseSrt, serializeSrt } from "../srt";

describe("serializeSrt", () => {
	test("serializes, sorts, and numbers valid cues", () => {
		const result = serializeSrt({
			captions: [
				{ text: "Kedua", startTime: 2.5, duration: 1.25 },
				{ text: "Pertama", startTime: 0, duration: 1.001 },
			],
		});

		expect(result).toBe(
			"1\n00:00:00,000 --> 00:00:01,001\nPertama\n\n2\n00:00:02,500 --> 00:00:03,750\nKedua",
		);
	});

	test("skips invalid cues and preserves multiline text", () => {
		const result = serializeSrt({
			captions: [
				{ text: " ", startTime: 0, duration: 1 },
				{ text: "Baris satu\r\nBaris dua", startTime: 65, duration: 2 },
				{ text: "Rusak", startTime: 1, duration: 0 },
			],
		});

		expect(result).toBe(
			"1\n00:01:05,000 --> 00:01:07,000\nBaris satu\nBaris dua",
		);
	});

	test("round trips generated cues through the parser", () => {
		const serialized = serializeSrt({
			captions: [{ text: "Halo dunia", startTime: 1.25, duration: 2.5 }],
		});

		expect(parseSrt({ input: serialized }).captions).toEqual([
			{ text: "Halo dunia", startTime: 1.25, duration: 2.5 },
		]);
	});
});
