import type { EffectDefinition } from "@/effects/types";

function hexToRgb(value: unknown): number[] {
	const hex = typeof value === "string" ? value.replace("#", "") : "00ff00";
	const parsed = Number.parseInt(hex.padEnd(6, "0").slice(0, 6), 16);
	return [
		((parsed >> 16) & 255) / 255,
		((parsed >> 8) & 255) / 255,
		(parsed & 255) / 255,
	];
}

export const backgroundRemoverEffectDefinition: EffectDefinition = {
	type: "background-remover",
	name: "Background Remover (local)",
	keywords: ["background", "remove", "green screen", "chroma key"],
	params: [
		{
			key: "keyColor",
			label: "Background color",
			type: "color",
			default: "#00ff00",
		},
		{
			key: "threshold",
			label: "Edge cleanup",
			type: "number",
			default: 18,
			min: 0,
			max: 100,
			step: 1,
		},
		{
			key: "softness",
			label: "Edge feather",
			type: "number",
			default: 12,
			min: 1,
			max: 100,
			step: 1,
		},
		{
			key: "spill",
			label: "Spill removal",
			type: "number",
			default: 35,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		passes: [
			{
				shader: "chroma-key",
				uniforms: ({ effectParams }) => ({
					u_key: hexToRgb(effectParams.keyColor),
					u_threshold: Number(effectParams.threshold) / 100,
					u_softness: Number(effectParams.softness) / 100,
					u_spill: Number(effectParams.spill) / 100,
				}),
			},
		],
	},
};

