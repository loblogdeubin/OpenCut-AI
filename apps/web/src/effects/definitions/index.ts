import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { colorCorrectionEffectDefinition } from "./color-correction";
import { backgroundRemoverEffectDefinition } from "./background-remover";
import { aiVideoBackgroundRemoverEffectDefinition } from "./ai-video-background-remover";

const defaultEffects = [
	blurEffectDefinition,
	colorCorrectionEffectDefinition,
	backgroundRemoverEffectDefinition,
	aiVideoBackgroundRemoverEffectDefinition,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
