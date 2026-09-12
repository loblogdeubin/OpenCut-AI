export type FramingMode = "fit" | "fill" | "original";

export function getFramingScale({ mode, canvasSize, sourceSize }: {
	mode: FramingMode;
	canvasSize: { width: number; height: number };
	sourceSize: { width: number; height: number };
}): number {
	const contain = Math.min(canvasSize.width / sourceSize.width, canvasSize.height / sourceSize.height);
	if (!Number.isFinite(contain) || contain <= 0) return 1;
	if (mode === "fit") return 1;
	if (mode === "original") return 1 / contain;
	return Math.max(canvasSize.width / sourceSize.width, canvasSize.height / sourceSize.height) / contain;
}

export function getAspectCropFractions({ sourceAspect, targetAspect }: { sourceAspect: number; targetAspect: number }) {
	return sourceAspect >= targetAspect
		? { width: targetAspect / sourceAspect, height: 1 }
		: { width: 1, height: sourceAspect / targetAspect };
}
