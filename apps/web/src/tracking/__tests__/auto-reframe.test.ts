import { describe, expect, test } from "bun:test";
import { buildAutoReframeKeyframes } from "../auto-reframe";

describe("auto reframe", () => {
	test("fills portrait canvas uniformly and follows the subject", () => {
		const [frame] = buildAutoReframeKeyframes({
			points: [{ time: 0, x: 480, y: 540, confidence: 1 }],
			sourceSize: { width: 1920, height: 1080 },
			canvasSize: { width: 1080, height: 1920 },
			basePosition: { x: 0, y: 0 },
		});
		expect(frame.scale).toBeCloseTo(3.16049, 4);
		expect(frame.positionX).toBeGreaterThan(0);
		expect(frame.positionY).toBe(0);
	});

	test("clamps tracking to filled media edges", () => {
		const [frame] = buildAutoReframeKeyframes({
			points: [{ time: 0, x: -5000, y: 540, confidence: 1 }],
			sourceSize: { width: 1920, height: 1080 },
			canvasSize: { width: 1080, height: 1920 },
			basePosition: { x: 0, y: 0 },
		});
		expect(frame.positionX).toBeCloseTo(1166.6667, 3);
	});
});

