import type { EffectDefinition } from "@/effects/types";

export const COLOR_CORRECTION_SHADER = "color-correction";

const number = ({ value, fallback }: { value: unknown; fallback: number }) =>
	typeof value === "number" ? value : Number(value) || fallback;

export const AUTO_COLOR_PARAMS = {
	exposure: 0.12,
	contrast: 8,
	highlights: -8,
	shadows: 10,
	temperature: 0,
	tint: 0,
	saturation: 3,
	vibrance: 12,
	intensity: 100,
} as const;

export const colorCorrectionEffectDefinition: EffectDefinition = {
	type: "color-correction",
	name: "Smart Color",
	keywords: ["color", "auto", "exposure", "contrast", "white balance"],
	params: [
		{
			key: "intensity",
			label: "Intensity",
			type: "number",
			default: 100,
			min: 0,
			max: 100,
			step: 1,
			unit: "percent",
		},
		{
			key: "exposure",
			label: "Exposure",
			type: "number",
			default: 0,
			min: -2,
			max: 2,
			step: 0.05,
			shortLabel: "E",
		},
		{
			key: "contrast",
			label: "Contrast",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
			shortLabel: "C",
		},
		{
			key: "highlights",
			label: "Highlights",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
			shortLabel: "H",
		},
		{
			key: "shadows",
			label: "Shadows",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
			shortLabel: "S",
		},
		{
			key: "temperature",
			label: "Temperature",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
			shortLabel: "T",
		},
		{
			key: "tint",
			label: "Tint",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "saturation",
			label: "Saturation",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
		{
			key: "vibrance",
			label: "Vibrance",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			{
				shader: COLOR_CORRECTION_SHADER,
				uniforms: {
					u_exposure: number({ value: effectParams.exposure, fallback: 0 }),
					u_contrast:
						number({ value: effectParams.contrast, fallback: 0 }) / 100,
					u_highlights:
						number({ value: effectParams.highlights, fallback: 0 }) / 300,
					u_shadows: number({ value: effectParams.shadows, fallback: 0 }) / 300,
					u_temperature:
						number({ value: effectParams.temperature, fallback: 0 }) / 500,
					u_tint: number({ value: effectParams.tint, fallback: 0 }) / 500,
					u_saturation:
						number({ value: effectParams.saturation, fallback: 0 }) / 100,
					u_vibrance:
						number({ value: effectParams.vibrance, fallback: 0 }) / 100,
					u_intensity:
						number({ value: effectParams.intensity, fallback: 100 }) / 100,
				},
			},
		],
	},
};
