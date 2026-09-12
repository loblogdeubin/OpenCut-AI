import type { ParamValues } from "@/params";

type Suggestion = {
	exposure: number;
	contrast: number;
	highlights: number;
	shadows: number;
	temperature: number;
	tint: number;
	saturation: number;
	vibrance: number;
};
type WasmWithColorAnalysis = {
	analyzeColorSamples?: (rgba: Uint8Array) => Suggestion;
};

export async function analyzeCurrentPreviewFrame(): Promise<ParamValues> {
	const marked = document.querySelector<HTMLCanvasElement>(
		'canvas[data-opencut-preview="true"]',
	);
	const source =
		marked ??
		[...document.querySelectorAll<HTMLCanvasElement>("canvas")]
			.filter((canvas) => canvas.width > 0 && canvas.height > 0)
			.sort((left, right) => right.width * right.height - left.width * left.height)[0];
	if (!source || source.width === 0 || source.height === 0)
		throw new Error("Preview frame is not ready");
	const scale = Math.min(1, 160 / Math.max(source.width, source.height));
	const width = Math.max(1, Math.round(source.width * scale));
	const height = Math.max(1, Math.round(source.height * scale));
	const sample = document.createElement("canvas");
	sample.width = width;
	sample.height = height;
	const context = sample.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("Color analysis canvas is unavailable");
	context.drawImage(source, 0, 0, width, height);
	const rgba = context.getImageData(0, 0, width, height).data;
	const wasm = (await import("opencut-wasm")) as WasmWithColorAnalysis;
	const suggestion = wasm.analyzeColorSamples
		? wasm.analyzeColorSamples(new Uint8Array(rgba))
		: suggestColorCorrectionFallback(rgba);
	return { ...suggestion, intensity: 100 };
}

// Exact fallback for a development build whose published WASM predates this API.
export function suggestColorCorrectionFallback(
	rgba: Uint8ClampedArray,
): Suggestion {
	let red = 0,
		green = 0,
		blue = 0,
		count = 0;
	const luminances: number[] = [];
	for (let index = 0; index + 3 < rgba.length; index += 4) {
		if (rgba[index + 3] <= 8) continue;
		const r = rgba[index] / 255,
			g = rgba[index + 1] / 255,
			b = rgba[index + 2] / 255;
		red += r;
		green += g;
		blue += b;
		luminances.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
		count += 1;
	}
	if (count === 0)
		return {
			exposure: 0,
			contrast: 0,
			highlights: 0,
			shadows: 0,
			temperature: 0,
			tint: 0,
			saturation: 0,
			vibrance: 0,
		};
	red /= count;
	green /= count;
	blue /= count;
	const meanLuma = luminances.reduce((sum, value) => sum + value, 0) / count;
	const deviation = Math.sqrt(
		luminances.reduce((sum, value) => sum + (value - meanLuma) ** 2, 0) / count,
	);
	const clamp = (value: number, min: number, max: number) =>
		Math.min(max, Math.max(min, value));
	return {
		exposure: clamp(
			Math.log2(0.48 / Math.max(meanLuma, 0.03)) * 0.55,
			-1.25,
			1.25,
		),
		contrast: clamp((0.18 - deviation) * 160, -18, 24),
		highlights: meanLuma > 0.62 ? -12 : 0,
		shadows: meanLuma < 0.4 ? 18 : 6,
		temperature: clamp((blue - red) * 45, -18, 18),
		tint: clamp(((red + blue) * 0.5 - green) * 40, -15, 15),
		saturation: 4,
		vibrance: 12,
	};
}
