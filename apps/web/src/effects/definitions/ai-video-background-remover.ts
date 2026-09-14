import type { EffectDefinition } from "@/effects/types";

export const aiVideoBackgroundRemoverEffectDefinition: EffectDefinition = {
	type: "ai-video-background-remover",
	name: "AI Remove BG",
	keywords: ["background", "remove", "person", "video", "ai"],
	params: [
		{
			key: "quality",
			label: "Mask quality",
			type: "select",
			default: "balanced",
			options: [
				{ label: "Draft", value: "draft" },
				{ label: "Balanced", value: "balanced" },
				{ label: "Quality", value: "quality" },
			],
		},
	],
	renderer: { passes: [] },
};
