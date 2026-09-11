import {
	getPiperPreflight,
	synthesizeWithPiper,
} from "@/local-ai/piper-server";
import { getSapiPreflight, synthesizeWithSapi } from "@/local-ai/sapi-server";
import type {
	LocalDubbingPreflight,
	LocalDubbingProvider,
} from "@/local-ai/types";

export async function getLocalDubbingPreflight(): Promise<LocalDubbingPreflight> {
	const providers = await Promise.all([
		getSapiPreflight(),
		getPiperPreflight(),
	]);
	const defaultProvider = providers.find((provider) => provider.available)?.id;
	return {
		available: Boolean(defaultProvider),
		defaultProvider,
		providers,
	};
}

export async function synthesizeLocalDubbing({
	text,
	provider,
	voice,
	outputPath,
}: {
	text: string;
	provider?: LocalDubbingProvider;
	voice?: string;
	outputPath: string;
}): Promise<{ provider: LocalDubbingProvider; voice: string }> {
	const selectedProvider =
		provider ?? (await getLocalDubbingPreflight()).defaultProvider;
	if (selectedProvider === "windows-sapi") {
		const result = await synthesizeWithSapi({ text, voice, outputPath });
		return { provider: selectedProvider, voice: result.voice };
	}
	const result = await synthesizeWithPiper({ text, voice, outputPath });
	return { provider: "piper", voice: result.voice };
}
