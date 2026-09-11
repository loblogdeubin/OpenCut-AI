export type TextMotionPresetId =
	| "classic-fade"
	| "classic-rise"
	| "classic-slide"
	| "classic-pop"
	| "classic-zoom"
	| "classic-drop";

export interface TextMotionPlanKeyframe {
	propertyPath: string;
	timeTicks: number;
	value: number;
	interpolation: "bezier";
}

export function buildTextMotionPlan({
	preset,
	durationTicks,
	ticksPerSecond,
	positionX,
	positionY,
	scaleX,
	scaleY,
	opacity,
}: {
	preset: TextMotionPresetId;
	durationTicks: number;
	ticksPerSecond: number;
	positionX: number;
	positionY: number;
	scaleX: number;
	scaleY: number;
	opacity: number;
}): TextMotionPlanKeyframe[] {
	if (durationTicks <= 0 || ticksPerSecond <= 0) return [];

	const motionTicks = Math.max(
		1,
		Math.min(Math.round(ticksPerSecond * 0.45), Math.round(durationTicks / 3)),
	);
	const outroStart = durationTicks - motionTicks;
	const keyframes: TextMotionPlanKeyframe[] = [];
	const add = ({
		propertyPath,
		timeTicks,
		value,
	}: Omit<TextMotionPlanKeyframe, "interpolation">) => {
		keyframes.push({ propertyPath, timeTicks, value, interpolation: "bezier" });
	};
	const addOpacity = () => {
		add({ propertyPath: "opacity", timeTicks: 0, value: 0 });
		add({ propertyPath: "opacity", timeTicks: motionTicks, value: opacity });
		add({ propertyPath: "opacity", timeTicks: outroStart, value: opacity });
		add({ propertyPath: "opacity", timeTicks: durationTicks, value: 0 });
	};

	if (preset === "classic-rise" || preset === "classic-drop") {
		const direction = preset === "classic-rise" ? 1 : -1;
		add({
			propertyPath: "transform.positionY",
			timeTicks: 0,
			value: positionY + 72 * direction,
		});
		add({
			propertyPath: "transform.positionY",
			timeTicks: motionTicks,
			value: positionY,
		});
		add({
			propertyPath: "transform.positionY",
			timeTicks: outroStart,
			value: positionY,
		});
		add({
			propertyPath: "transform.positionY",
			timeTicks: durationTicks,
			value: positionY - 36 * direction,
		});
	}
	if (preset === "classic-slide") {
		add({
			propertyPath: "transform.positionX",
			timeTicks: 0,
			value: positionX - 120,
		});
		add({
			propertyPath: "transform.positionX",
			timeTicks: motionTicks,
			value: positionX,
		});
		add({
			propertyPath: "transform.positionX",
			timeTicks: outroStart,
			value: positionX,
		});
		add({
			propertyPath: "transform.positionX",
			timeTicks: durationTicks,
			value: positionX + 120,
		});
	}
	if (preset === "classic-pop" || preset === "classic-zoom") {
		for (const [propertyPath, base] of [
			["transform.scaleX", scaleX],
			["transform.scaleY", scaleY],
		] as const) {
			const initialFactor = preset === "classic-pop" ? 0.72 : 1.18;
			const finalFactor = preset === "classic-pop" ? 0.9 : 1.08;
			add({ propertyPath, timeTicks: 0, value: base * initialFactor });
			add({ propertyPath, timeTicks: motionTicks, value: base });
			add({ propertyPath, timeTicks: outroStart, value: base });
			add({
				propertyPath,
				timeTicks: durationTicks,
				value: base * finalFactor,
			});
		}
	}
	addOpacity();
	return keyframes;
}
