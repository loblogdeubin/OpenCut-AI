import { upsertPathKeyframe } from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import type { TextElement } from "@/timeline";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import { roundMediaTime, TICKS_PER_SECOND } from "@/wasm";
import {
	buildTextMotionPlan,
	type TextMotionPresetId,
} from "@/text/motion-plan";

export const TEXT_MOTION_PRESETS = [
	{
		id: "classic-fade",
		label: "Classic Fade",
		description: "Fade lembut masuk dan keluar",
		previewClass: "opacity-40 group-hover:opacity-100",
	},
	{
		id: "classic-rise",
		label: "Classic Rise",
		description: "Naik halus dari bawah",
		previewClass:
			"translate-y-3 opacity-50 group-hover:translate-y-0 group-hover:opacity-100",
	},
	{
		id: "classic-slide",
		label: "Classic Slide",
		description: "Masuk dari sisi kiri",
		previewClass:
			"-translate-x-3 opacity-50 group-hover:translate-x-0 group-hover:opacity-100",
	},
	{
		id: "classic-pop",
		label: "Classic Pop",
		description: "Membesar dengan cepat",
		previewClass:
			"scale-75 opacity-50 group-hover:scale-100 group-hover:opacity-100",
	},
	{
		id: "classic-zoom",
		label: "Classic Zoom",
		description: "Zoom turun menuju ukuran asli",
		previewClass:
			"scale-125 opacity-50 group-hover:scale-100 group-hover:opacity-100",
	},
	{
		id: "classic-drop",
		label: "Classic Drop",
		description: "Turun halus dari atas",
		previewClass:
			"-translate-y-3 opacity-50 group-hover:translate-y-0 group-hover:opacity-100",
	},
] as const;

export type { TextMotionPresetId } from "@/text/motion-plan";

function numericParam({
	element,
	key,
	fallback,
}: {
	element: TextElement;
	key: string;
	fallback: number;
}): number {
	const value = element.params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function buildTextMotionAnimations({
	element,
	preset,
}: {
	element: TextElement;
	preset: TextMotionPresetId;
}): ElementAnimations {
	const positionX = numericParam({
		element,
		key: "transform.positionX",
		fallback: 0,
	});
	const positionY = numericParam({
		element,
		key: "transform.positionY",
		fallback: 0,
	});
	const scaleX = numericParam({
		element,
		key: "transform.scaleX",
		fallback: 1,
	});
	const scaleY = numericParam({
		element,
		key: "transform.scaleY",
		fallback: 1,
	});
	const opacity = numericParam({ element, key: "opacity", fallback: 1 });
	const keyframes = buildTextMotionPlan({
		preset,
		durationTicks: element.duration,
		ticksPerSecond: TICKS_PER_SECOND,
		positionX,
		positionY,
		scaleX,
		scaleY,
		opacity,
	});

	let animations: ElementAnimations | undefined;
	for (const keyframe of keyframes) {
		const target = resolveAnimationTarget({
			element,
			path: keyframe.propertyPath,
		});
		if (!target) continue;
		animations = upsertPathKeyframe({
			animations,
			propertyPath: keyframe.propertyPath,
			time: roundMediaTime({ time: keyframe.timeTicks }),
			value: keyframe.value,
			interpolation: keyframe.interpolation,
			channelLayout: target.channelLayout,
			coerceValue: target.coerceValue,
		});
	}

	return animations ?? {};
}

export function isSubtitleTextElement({
	element,
}: {
	element: TextElement;
}): boolean {
	return /^Caption \d+$/i.test(element.name);
}
