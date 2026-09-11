import { describe, expect, test } from "bun:test";
import { parseAudioCatalogV1, parseAudioPlanV1 } from "../audio-plan";

const plan = {
	schemaVersion: "1.0",
	planId: "plan-1",
	idempotencyKey: "key-1",
	projectId: "project-1",
	baseProjectRevision: 2,
	baseTimelineHash: "sha256:abc",
	catalogId: "catalog-1",
	catalogRevision: 4,
	operations: [
		{
			type: "insert_catalog_audio",
			operationId: "insert-1",
			resultElementId: "audio-1",
			catalogAssetId: "calm-1",
			targetTrackId: "music",
			timelineStartTicks: 0,
			sourceStartTicks: 0,
			durationTicks: 90_000,
			gainDb: -12,
			fadeInTicks: 1_000,
			fadeOutTicks: 1_000,
			ducking: null,
		},
	],
};

describe("AudioPlanV1 parsing", () => {
	test("parses fenced GPT JSON", () => {
		expect(
			parseAudioPlanV1({
				input: `\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``,
			}),
		).toEqual(plan);
	});

	test("rejects unknown fields and unsupported operation shapes", () => {
		expect(() =>
			parseAudioPlanV1({ input: { ...plan, inventedByModel: true } }),
		).toThrow("JSON bukan AudioPlanV1 yang valid.");
		expect(() =>
			parseAudioPlanV1({
				input: { ...plan, operations: [{ type: "download_any_url" }] },
			}),
		).toThrow("JSON bukan AudioPlanV1 yang valid.");
	});

	test("accepts a remote catalog asset before it has a project media ID", () => {
		const catalog = {
			schemaVersion: "1.0",
			catalogId: "catalog-1",
			revision: 4,
			assets: [
				{
					id: "calm-1",
					mediaId: null,
					kind: "music",
					durationTicks: 180_000,
					license: {
						licenseId: "CC0-1.0",
						licenseName: "Creative Commons Zero 1.0",
						sourceUrl: "https://example.test/audio",
						licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
						creator: "Example creator",
						attributionRequired: false,
						attributionText: null,
						commercialUseAllowed: true,
						derivativeUseAllowed: true,
						reviewStatus: "verified",
						reviewedAt: "2026-09-07T00:00:00Z",
					},
				},
			],
		};

		expect(parseAudioCatalogV1({ input: catalog })).toEqual(catalog);
	});
});
