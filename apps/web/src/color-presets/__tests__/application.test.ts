import { describe, expect, test } from "bun:test";
import type { Effect } from "@/effects/types";
import {
	applyColorPresetToEffects,
	normalizeColorPresetIntensity,
	resetColorPresetEffects,
	setColorPresetIntensityOnEffects,
} from "../application";

const blurEffect: Effect = {
	id: "blur-1",
	type: "blur",
	params: { amount: 12 },
	enabled: true,
};

describe("color preset application", () => {
	test("adds a non-destructive color effect and preserves other effects", () => {
		const effects = applyColorPresetToEffects({
			effects: [blurEffect],
			adjustments: { exposure: 0.4, contrast: 18 },
			intensity: 65,
			createId: () => "color-1",
		});

		expect(effects).toHaveLength(2);
		expect(effects[0]).toBe(blurEffect);
		expect(effects[1]).toMatchObject({
			id: "color-1",
			type: "color-correction",
			enabled: true,
			params: { exposure: 0.4, contrast: 18, intensity: 65 },
		});
	});

	test("replaces the existing preset effect without changing its id", () => {
		const effects = applyColorPresetToEffects({
			effects: [
				{
					id: "color-existing",
					type: "color-correction",
					params: { exposure: 1 },
					enabled: false,
				},
			],
			adjustments: { saturation: 24 },
		});

		expect(effects).toHaveLength(1);
		expect(effects[0]).toMatchObject({
			id: "color-existing",
			enabled: true,
			params: { exposure: 0, saturation: 24, intensity: 100 },
		});
	});

	test("updates intensity independently and clamps its value", () => {
		const effects = setColorPresetIntensityOnEffects({
			effects: [
				{
					id: "color-1",
					type: "color-correction",
					params: { exposure: 0.5, intensity: 50 },
					enabled: true,
				},
				blurEffect,
			],
			intensity: 140,
		});

		expect(effects[0]?.params).toEqual({ exposure: 0.5, intensity: 100 });
		expect(effects[1]).toBe(blurEffect);
		expect(normalizeColorPresetIntensity({ intensity: -20 })).toBe(0);
	});

	test("reset removes only color preset effects", () => {
		const effects = resetColorPresetEffects({
			effects: [
				blurEffect,
				{
					id: "color-1",
					type: "color-correction",
					params: {},
					enabled: true,
				},
			],
		});

		expect(effects).toEqual([blurEffect]);
	});
});
