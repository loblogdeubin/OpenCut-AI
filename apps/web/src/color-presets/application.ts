import type { Effect } from "@/effects/types";
import type { ParamValues } from "@/params";
import type { TimelineElement } from "@/timeline";
import { generateUUID } from "@/utils/id";

export const COLOR_PRESET_EFFECT_TYPE = "color-correction";

export type ColorPresetAdjustments = {
	exposure?: number;
	contrast?: number;
	highlights?: number;
	shadows?: number;
	temperature?: number;
	tint?: number;
	saturation?: number;
	vibrance?: number;
};

const DEFAULT_COLOR_ADJUSTMENTS: Required<ColorPresetAdjustments> = {
	exposure: 0,
	contrast: 0,
	highlights: 0,
	shadows: 0,
	temperature: 0,
	tint: 0,
	saturation: 0,
	vibrance: 0,
};

// TypeScript requires the narrowed subject of a type predicate to be positional.
export function isColorPresetTarget(
	element: TimelineElement,
): element is Extract<TimelineElement, { type: "video" | "image" }> {
	return element.type === "video" || element.type === "image";
}

export function normalizeColorPresetIntensity({
	intensity,
}: {
	intensity: number;
}): number {
	if (!Number.isFinite(intensity)) return 100;
	return Math.min(100, Math.max(0, intensity));
}

export function applyColorPresetToEffects({
	effects,
	adjustments,
	intensity = 100,
	createId = generateUUID,
}: {
	effects: Effect[] | undefined;
	adjustments: ColorPresetAdjustments;
	intensity?: number;
	createId?: () => string;
}): Effect[] {
	const currentEffects = effects ?? [];
	const existingIndex = currentEffects.findIndex(
		(effect) => effect.type === COLOR_PRESET_EFFECT_TYPE,
	);
	const existing = existingIndex >= 0 ? currentEffects[existingIndex] : null;
	const params: ParamValues = {
		...DEFAULT_COLOR_ADJUSTMENTS,
		...adjustments,
		intensity: normalizeColorPresetIntensity({ intensity }),
	};
	const presetEffect: Effect = {
		id: existing?.id ?? createId(),
		type: COLOR_PRESET_EFFECT_TYPE,
		params,
		enabled: true,
	};

	if (existingIndex < 0) return [...currentEffects, presetEffect];
	return currentEffects.map((effect, index) =>
		index === existingIndex ? presetEffect : effect,
	);
}

export function setColorPresetIntensityOnEffects({
	effects,
	intensity,
}: {
	effects: Effect[] | undefined;
	intensity: number;
}): Effect[] {
	const normalized = normalizeColorPresetIntensity({ intensity });
	return (effects ?? []).map((effect) =>
		effect.type === COLOR_PRESET_EFFECT_TYPE
			? {
					...effect,
					params: { ...effect.params, intensity: normalized },
				}
			: effect,
	);
}

export function resetColorPresetEffects({
	effects,
}: {
	effects: Effect[] | undefined;
}): Effect[] {
	return (effects ?? []).filter(
		(effect) => effect.type !== COLOR_PRESET_EFFECT_TYPE,
	);
}
