import { describe, expect, test } from "bun:test";
import { buildTextMotionPlan } from "../motion-plan";

const base = {
	durationTicks: 3_000,
	ticksPerSecond: 1_000,
	positionX: 10,
	positionY: 20,
	scaleX: 1,
	scaleY: 1,
	opacity: 1,
};

describe("text motion plan", () => {
	test("classic fade creates symmetric entrance and exit", () => {
		const keys = buildTextMotionPlan({ ...base, preset: "classic-fade" });
		expect(keys.map(({ value }) => value)).toEqual([0, 1, 1, 0]);
		expect(keys.map(({ timeTicks }) => timeTicks)).toEqual([
			0, 450, 2_550, 3_000,
		]);
	});

	test("classic rise animates position and opacity", () => {
		const keys = buildTextMotionPlan({ ...base, preset: "classic-rise" });
		expect(
			keys.filter(({ propertyPath }) => propertyPath === "opacity"),
		).toHaveLength(4);
		expect(
			keys.filter(({ propertyPath }) => propertyPath === "transform.positionY"),
		).toHaveLength(4);
	});

	test("short clips keep all keyframes inside the clip", () => {
		const keys = buildTextMotionPlan({
			...base,
			preset: "classic-pop",
			durationTicks: 300,
		});
		expect(
			keys.every(({ timeTicks }) => timeTicks >= 0 && timeTicks <= 300),
		).toBe(true);
	});
});
