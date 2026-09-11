import { describe, expect, test } from "bun:test";
import {
	DubbingRequestError,
	MAX_DUBBING_TEXT_CHARACTERS,
	isSafeDubbingVoiceId,
	parseDubbingSynthesisRequest,
} from "@/local-ai/dubbing-validation";

describe("dubbing request validation", () => {
	test("normalizes valid text and voice", () => {
		expect(
			parseDubbingSynthesisRequest({
				value: {
					text: "  Halo dunia.  ",
					provider: "piper",
					voice: "id_ID-news-medium",
				},
			}),
		).toEqual({
			text: "Halo dunia.",
			provider: "piper",
			voice: "id_ID-news-medium",
		});
	});

	test("rejects empty, oversized, and control-character text", () => {
		for (const text of [
			"   ",
			"x".repeat(MAX_DUBBING_TEXT_CHARACTERS + 1),
			"halo\u0000dunia",
		]) {
			expect(() => parseDubbingSynthesisRequest({ value: { text } })).toThrow(
				DubbingRequestError,
			);
		}
	});

	test("only accepts opaque voice identifiers", () => {
		expect(isSafeDubbingVoiceId({ voice: "id_ID-voice-medium" })).toBe(true);
		for (const voice of [
			"../voice",
			"voice/model",
			"voice model",
			"-voice",
			"",
		]) {
			expect(isSafeDubbingVoiceId({ voice })).toBe(false);
		}
	});

	test("rejects unknown providers", () => {
		expect(() =>
			parseDubbingSynthesisRequest({
				value: { text: "Halo", provider: "shell" },
			}),
		).toThrow(DubbingRequestError);
	});
});
