import { describe, expect, test } from "bun:test";
import type { Command } from "@/commands";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import type { EditableProjectState, TProject } from "@/project/types";
import { mediaTime, TICKS_PER_SECOND } from "@/wasm";
import type { EditPlanV1 } from "../contracts";
import { OpenCutEditorAdapter } from "../editor-adapter";

function createHarness() {
	const now = new Date("2026-08-29T00:00:00.000Z");
	let project: TProject = {
		metadata: {
			id: "project-1",
			name: "Test",
			duration: mediaTime({ ticks: 0 }),
			createdAt: now,
			updatedAt: now,
		},
		revision: 0,
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
						elements: [],
					},
					overlay: [],
					audio: [],
				},
			},
		],
	};
	const mediaAssets = [
		{
			id: "media-1",
			name: "Take",
			type: "video",
			duration: 100 / TICKS_PER_SECOND,
			file: new File([], "take.mp4"),
		},
	] as MediaAsset[];
	let topCommand: Command | null = null;
	const projectHost = {
		getActive: () => project,
		getEditableState: (): EditableProjectState => ({
			scenes: project.scenes,
			currentSceneId: project.currentSceneId,
			settings: project.settings,
			revision: project.revision,
		}),
		replaceEditableState: ({ state }: { state: EditableProjectState }) => {
			project = { ...project, ...state };
		},
	};
	const editor = {
		project: projectHost,
		media: { getAssets: () => mediaAssets },
		command: {
			execute: ({ command }: { command: Command }) => {
				command.execute();
				topCommand = command;
				return command;
			},
			undoExpected: ({ command }: { command: Command }) => {
				if (topCommand !== command) return false;
				command.undo();
				topCommand = null;
				return true;
			},
		},
	} as unknown as EditorCore;
	return {
		adapter: new OpenCutEditorAdapter(editor),
		getProject: () => project,
	};
}

describe("OpenCutEditorAdapter", () => {
	test("validates, commits idempotently, and undoes one complete plan", () => {
		const harness = createHarness();
		const before = harness.adapter.getProjectSnapshot();
		const plan: EditPlanV1 = {
			schemaVersion: "1.0",
			planId: "plan-1",
			idempotencyKey: "request-1",
			projectId: "project-1",
			baseProjectRevision: 0,
			baseTimelineHash: before.timelineHash,
			operations: [
				{
					type: "insert_segment",
					operationId: "insert-1",
					resultElementId: "element-1",
					mediaId: "media-1",
					targetTrackId: "main-track",
					sourceStartTicks: 10,
					sourceEndTicks: 60,
					timelineStartTicks: 0,
				},
			],
		};

		const committed = harness.adapter.applyPlan({ plan });
		expect(committed.status).toBe("committed");
		expect(harness.getProject().revision).toBe(1);
		expect(harness.getProject().scenes[0].tracks.main.elements).toHaveLength(1);
		expect(harness.adapter.applyPlan({ plan }).status).toBe(
			"already_committed",
		);

		if (committed.status === "rejected") throw new Error("Plan was rejected");
		expect(
			harness.adapter.undoTransaction({
				transactionId: committed.transactionId,
			}),
		).toBe(true);
		expect(harness.getProject().scenes[0].tracks.main.elements).toHaveLength(0);
		expect(harness.adapter.getProjectSnapshot().timelineHash).toBe(
			before.timelineHash,
		);
	});

	test("rejects stale plans without changing state", () => {
		const harness = createHarness();
		const before = harness.adapter.getProjectSnapshot();
		const plan: EditPlanV1 = {
			schemaVersion: "1.0",
			planId: "stale",
			idempotencyKey: "stale",
			projectId: "project-1",
			baseProjectRevision: 0,
			baseTimelineHash: "sha256:stale",
			operations: [
				{
					type: "update_output_settings",
					operationId: "settings-1",
					canvasWidth: 1080,
				},
			],
		};

		const result = harness.adapter.applyPlan({ plan });
		expect(result.status).toBe("rejected");
		expect(harness.adapter.getProjectSnapshot().timelineHash).toBe(
			before.timelineHash,
		);
	});
});
