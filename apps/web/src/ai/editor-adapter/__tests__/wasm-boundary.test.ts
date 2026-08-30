import { describe, expect, test } from "bun:test";
import {
	detectAudibleRanges,
	hashProjectContent,
	validateEditPlan,
} from "../wasm-boundary";
import type {
	EditPlanV1,
	ProjectContentV1,
	ProjectSnapshotV1,
} from "../contracts";

const content: ProjectContentV1 = {
	schemaVersion: "1.0",
	currentSceneId: "scene-1",
	settings: {
		fpsNumerator: 30,
		fpsDenominator: 1,
		canvasWidth: 1920,
		canvasHeight: 1080,
		background: { type: "color", color: "#000000" },
	},
	scenes: [
		{
			id: "scene-1",
			isMain: true,
			bookmarks: [],
			tracks: [
				{
					id: "main-track",
					kind: "video",
					muted: false,
					hidden: false,
					elements: [],
				},
			],
		},
	],
	media: [
		{
			id: "media-1",
			kind: "video",
			durationTicks: 1_000,
			checksum: null,
		},
	],
};

describe("editor-contract WASM boundary", () => {
	test("detects audible ranges around long silence", () => {
		expect(
			detectAudibleRanges({
				amplitudes: [0, 0.2, 0, 0.2, 0, 0, 0, 0.3],
				sampleRate: 10,
				bucketSize: 10,
				totalDurationTicks: 8_000,
				ticksPerSecond: 1_000,
				threshold: 0.1,
				minSilenceTicks: 2_000,
				paddingTicks: 250,
				minSegmentTicks: 500,
			}),
		).toEqual([
			{ startTicks: 0, endTicks: 4_250 },
			{ startTicks: 6_750, endTicks: 8_000 },
		]);
	});

	test("hashes normalized content and validates a matching plan", () => {
		const hash = hashProjectContent({ content });
		expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);

		const snapshot: ProjectSnapshotV1 = {
			schemaVersion: "1.0",
			projectId: "project-1",
			revision: 3,
			content,
		};
		const plan: EditPlanV1 = {
			schemaVersion: "1.0",
			planId: "plan-1",
			idempotencyKey: "request-1",
			projectId: "project-1",
			baseProjectRevision: 3,
			baseTimelineHash: hash,
			operations: [
				{
					type: "insert_segment",
					operationId: "insert-1",
					resultElementId: "element-1",
					mediaId: "media-1",
					targetTrackId: "main-track",
					sourceStartTicks: 100,
					sourceEndTicks: 500,
					timelineStartTicks: 0,
				},
			],
		};

		const validation = validateEditPlan({ snapshot, plan });
		expect(validation.valid).toBe(true);
		expect(validation.currentTimelineHash).toBe(hash);
		expect(validation.errors).toEqual([]);
	});

	test("rejects a stale base hash without mutating content", () => {
		const before = JSON.stringify(content);
		const snapshot: ProjectSnapshotV1 = {
			schemaVersion: "1.0",
			projectId: "project-1",
			revision: 3,
			content,
		};
		const plan: EditPlanV1 = {
			schemaVersion: "1.0",
			planId: "plan-stale",
			idempotencyKey: "request-stale",
			projectId: "project-1",
			baseProjectRevision: 3,
			baseTimelineHash: "sha256:stale",
			operations: [
				{
					type: "update_output_settings",
					operationId: "settings-1",
					canvasWidth: 1080,
				},
			],
		};

		const validation = validateEditPlan({ snapshot, plan });
		expect(validation.valid).toBe(false);
		expect(validation.errors.map((error) => error.code)).toContain(
			"PROJECT_STALE",
		);
		expect(JSON.stringify(content)).toBe(before);
	});
});
