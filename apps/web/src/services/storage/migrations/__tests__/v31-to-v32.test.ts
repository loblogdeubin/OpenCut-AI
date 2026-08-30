import { describe, expect, test } from "bun:test";
import { transformProjectV31ToV32 } from "../transformers/v31-to-v32";

describe("V31 to V32 Migration", () => {
	test("adds revision zero while preserving existing project data", () => {
		const metadata = { id: "project-v31", name: "Project" };
		const scenes = [
			{ id: "scene-1", tracks: { main: {}, overlay: [], audio: [] } },
		];
		const result = transformProjectV31ToV32({
			project: { metadata, scenes, version: 31, customField: "preserved" },
		});

		expect(result.skipped).toBe(false);
		expect(result.project).toEqual({
			metadata,
			scenes,
			version: 32,
			revision: 0,
			customField: "preserved",
		});
	});

	test("preserves an existing valid revision", () => {
		const result = transformProjectV31ToV32({
			project: { id: "project-v31", version: 31, revision: 17 },
		});

		expect(result.skipped).toBe(false);
		expect(result.project.revision).toBe(17);
		expect(result.project.version).toBe(32);
	});

	test("normalizes an invalid revision to zero", () => {
		const result = transformProjectV31ToV32({
			project: { id: "project-v31", version: 31, revision: -1 },
		});

		expect(result.skipped).toBe(false);
		expect(result.project.revision).toBe(0);
	});

	test("skips projects outside version 31", () => {
		const current = { id: "current", version: 32, revision: 3 };
		const older = { id: "older", version: 30 };

		expect(transformProjectV31ToV32({ project: current })).toEqual({
			project: current,
			skipped: true,
			reason: "already v32",
		});
		expect(transformProjectV31ToV32({ project: older })).toEqual({
			project: older,
			skipped: true,
			reason: "not v31",
		});
	});
});
