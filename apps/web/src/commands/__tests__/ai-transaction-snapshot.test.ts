import { describe, expect, test } from "bun:test";
import { AIProjectSnapshotCommand } from "@/commands/project";
import type { EditableProjectState } from "@/project/types";
import type { TScene } from "@/timeline";

function buildScene({ id, name }: { id: string; name: string }): TScene {
	return {
		id,
		name,
		isMain: true,
		tracks: {
			main: {
				id: `${id}-main`,
				name: "Main",
				type: "video",
				elements: [],
				muted: false,
				hidden: false,
			},
			overlay: [],
			audio: [],
		},
		bookmarks: [],
		createdAt: new Date(0),
		updatedAt: new Date(0),
	};
}

function buildState({
	scene,
	revision,
}: {
	scene: TScene;
	revision: number;
}): EditableProjectState {
	return {
		scenes: [scene],
		currentSceneId: scene.id,
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		revision,
	};
}

describe("AIProjectSnapshotCommand", () => {
	test("applies, undoes, and redoes the complete editable state", () => {
		const before = buildState({
			scene: buildScene({ id: "before-scene", name: "Before" }),
			revision: 4,
		});
		const after = buildState({
			scene: buildScene({ id: "after-scene", name: "After" }),
			revision: 5,
		});
		let current = before;
		const applied: EditableProjectState[] = [];
		const host = {
			replaceEditableState: ({ state }: { state: EditableProjectState }) => {
				current = state;
				applied.push(state);
			},
		};
		const command = new AIProjectSnapshotCommand({ before, after, host });

		command.execute();
		expect(current).toBe(after);
		command.undo();
		expect(current).toBe(before);
		command.redo();
		expect(current).toBe(after);
		expect(applied).toEqual([after, before, after]);
	});
});
