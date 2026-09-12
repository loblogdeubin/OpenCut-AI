import { describe, expect, test } from "bun:test";
import { getAspectCropFractions, getFramingScale } from "../crop-presets";

describe("crop presets", () => {
	test("fit and fill keep one proportional scale", () => {
		expect(getFramingScale({ mode: "fit", canvasSize: { width: 1080, height: 1920 }, sourceSize: { width: 1920, height: 1080 } })).toBe(1);
		expect(getFramingScale({ mode: "fill", canvasSize: { width: 1080, height: 1920 }, sourceSize: { width: 1920, height: 1080 } })).toBeCloseTo(3.16049, 4);
	});
	test("aspect crop clips instead of stretching", () => {
		expect(getAspectCropFractions({ sourceAspect: 16 / 9, targetAspect: 1 })).toEqual({ width: 0.5625, height: 1 });
	});
});
