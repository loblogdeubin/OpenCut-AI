import { getFramingScale } from "@/rendering/crop-presets";
import type { TrackingPoint } from "./local-face-tracker";

export type AutoReframeKeyframe = {
	time: number;
	positionX: number;
	positionY: number;
	scale: number;
};

const clamp = ({ value, limit }: { value: number; limit: number }) =>
	Math.max(-limit, Math.min(limit, value));

/** Converts source-pixel tracking samples into non-distorting canvas transforms. */
export function buildAutoReframeKeyframes({
	points,
	sourceSize,
	canvasSize,
	basePosition,
}: {
	points: TrackingPoint[];
	sourceSize: { width: number; height: number };
	canvasSize: { width: number; height: number };
	basePosition: { x: number; y: number };
}): AutoReframeKeyframe[] {
	const scale = getFramingScale({ mode: "fill", canvasSize, sourceSize });
	const containScale = Math.min(
		canvasSize.width / sourceSize.width,
		canvasSize.height / sourceSize.height,
	);
	const renderedWidth = sourceSize.width * containScale * scale;
	const renderedHeight = sourceSize.height * containScale * scale;
	const xLimit = Math.max(0, (renderedWidth - canvasSize.width) / 2);
	const yLimit = Math.max(0, (renderedHeight - canvasSize.height) / 2);

	return points.map((point) => ({
		time: point.time,
		positionX:
			basePosition.x +
			clamp({
				value: (sourceSize.width / 2 - point.x) * containScale * scale,
				limit: xLimit,
			}),
		positionY:
			basePosition.y +
			clamp({
				value: (sourceSize.height / 2 - point.y) * containScale * scale,
				limit: yLimit,
			}),
		scale,
	}));
}

