import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";
import type { VideoElement } from "@/timeline";
import { mediaTime, TICKS_PER_SECOND } from "@/wasm";
import type { EditPlanV1 } from "../contracts";
import { reduceEditPlan } from "../reducer";

const ticks = (value: number) => mediaTime({ ticks: value });

function buildProject(elements: VideoElement[] = []): TProject {
	const now = new Date("2026-08-29T00:00:00.000Z");
	return {
		metadata: {
			id: "project-1",
			name: "Test",
			duration: ticks(100),
			createdAt: now,
			updatedAt: now,
		},
		revision: 7,
		version: 32,
		currentSceneId: "scene-1",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		scenes: [
			{
				id: "scene-1",
				name: "Main",
				isMain: true,
				createdAt: now,
				updatedAt: now,
				bookmarks: [],
				tracks: {
					main: {
						id: "main-track",
						name: "Main",
						type: "video",
						muted: false,
						hidden: false,
						elements,
					},
					overlay: [],
					audio: [],
				},
			},
		],
	};
}

function buildPlan(operations: EditPlanV1["operations"]): EditPlanV1 {
	return {
		schemaVersion: "1.0",
		planId: "plan-1",
		idempotencyKey: "request-1",
		projectId: "project-1",
		baseProjectRevision: 7,
		baseTimelineHash: "sha256:test",
		operations,
	};
}

const mediaAssets = [
	{
		id: "media-1",
		name: "Take 1",
		type: "video",
		duration: 100 / TICKS_PER_SECOND,
		file: new File([], "take-1.mp4"),
	},
] as MediaAsset[];

describe("reduceEditPlan", () => {
	test("inserts a predetermined source segment without mutating input", () => {
		const project = buildProject();
		const result = reduceEditPlan({
			project,
			mediaAssets,
			plan: buildPlan([
				{
					type: "insert_segment",
					operationId: "insert-1",
					resultElementId: "element-result",
					mediaId: "media-1",
					targetTrackId: "main-track",
					sourceStartTicks: 10,
					sourceEndTicks: 60,
					timelineStartTicks: 5,
				},
			]),
		});

		expect(project.scenes[0].tracks.main.elements).toHaveLength(0);
		expect(result.scenes[0].tracks.main.elements).toMatchObject([
			{
				id: "element-result",
				mediaId: "media-1",
				startTime: 5,
				duration: 50,
				trimStart: 10,
				trimEnd: 40,
				sourceDuration: 100,
			},
		]);
	});

	test("uses deterministic IDs when splitting and can change output settings", () => {
		const original: VideoElement = {
			id: "clip-1",
			name: "Clip",
			type: "video",
			mediaId: "media-1",
			startTime: ticks(0),
			duration: ticks(100),
			trimStart: ticks(0),
			trimEnd: ticks(0),
			sourceDuration: ticks(100),
			params: {},
		};
		const result = reduceEditPlan({
			project: buildProject([original]),
			mediaAssets,
			plan: buildPlan([
				{
					type: "split_elements",
					operationId: "split-1",
					targets: [
						{
							element: { trackId: "main-track", elementId: "clip-1" },
							leftResultElementId: "clip-left",
							rightResultElementId: "clip-right",
						},
					],
					splitTimeTicks: 40,
					retainSide: "both",
				},
				{
					type: "update_output_settings",
					operationId: "settings-1",
					canvasWidth: 1080,
					canvasHeight: 1920,
				},
			]),
		});

		expect(result.scenes[0].tracks.main.elements).toMatchObject([
			{ id: "clip-left", duration: 40, trimEnd: 60 },
			{ id: "clip-right", startTime: 40, duration: 60, trimStart: 40 },
		]);
		expect(result.settings.canvasSize).toEqual({ width: 1080, height: 1920 });
	});

	test("throws instead of silently skipping a missing target", () => {
		expect(() =>
			reduceEditPlan({
				project: buildProject(),
				mediaAssets,
				plan: buildPlan([
					{
						type: "delete_elements",
						operationId: "delete-1",
						elements: [{ trackId: "main-track", elementId: "missing" }],
					},
				]),
			}),
		).toThrow("does not exist");
	});
});
