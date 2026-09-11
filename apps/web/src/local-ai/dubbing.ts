import type {
	LocalDubbingPreflight,
	LocalDubbingProvider,
	LocalDubbingSynthesisResult,
} from "@/local-ai/types";

async function readError({ response }: { response: Response }) {
	try {
		const payload: unknown = await response.json();
		if (
			typeof payload === "object" &&
			payload !== null &&
			"error" in payload &&
			typeof payload.error === "string"
		) {
			return payload.error;
		}
	} catch {
		// Keep the stable fallback below for non-JSON server failures.
	}
	return "Dubber lokal gagal";
}

export async function getLocalDubbingPreflight(): Promise<LocalDubbingPreflight> {
	const response = await fetch("/api/local-ai/dubbing/preflight", {
		cache: "no-store",
	});
	if (!response.ok) throw new Error(await readError({ response }));
	const value: unknown = await response.json();
	if (!isLocalDubbingPreflight(value)) {
		throw new Error("Respons preflight dubber tidak valid");
	}
	return value;
}

export async function synthesizeDubbingLocally({
	text,
	provider,
	voice,
}: {
	text: string;
	provider?: LocalDubbingProvider;
	voice?: string;
}): Promise<LocalDubbingSynthesisResult> {
	const response = await fetch("/api/local-ai/dubbing/synthesize", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-opencut-local-ai": "1",
		},
		body: JSON.stringify({
			text,
			...(provider ? { provider } : {}),
			...(voice ? { voice } : {}),
		}),
	});
	if (!response.ok) throw new Error(await readError({ response }));
	const audio = await response.blob();
	if (audio.type !== "audio/wav" || audio.size <= 12) {
		throw new Error("Respons audio dubber tidak valid");
	}
	const selectedVoice = response.headers.get("x-opencut-dubbing-voice");
	if (!selectedVoice)
		throw new Error("Voice dubber tidak ditemukan pada respons");
	const selectedProvider = response.headers.get("x-opencut-dubbing-provider");
	if (selectedProvider !== "windows-sapi" && selectedProvider !== "piper") {
		throw new Error("Provider dubber tidak ditemukan pada respons");
	}
	return { audio, provider: selectedProvider, voice: selectedVoice };
}

function isLocalDubbingPreflight(
	value: unknown,
): value is LocalDubbingPreflight {
	if (typeof value !== "object" || value === null) return false;
	if (
		!("available" in value) ||
		typeof value.available !== "boolean" ||
		!("providers" in value) ||
		!Array.isArray(value.providers)
	) {
		return false;
	}
	if (
		"defaultProvider" in value &&
		value.defaultProvider !== undefined &&
		value.defaultProvider !== "windows-sapi" &&
		value.defaultProvider !== "piper"
	) {
		return false;
	}
	return value.providers.every((provider) => {
		if (
			typeof provider !== "object" ||
			provider === null ||
			!("id" in provider) ||
			(provider.id !== "windows-sapi" && provider.id !== "piper") ||
			!("available" in provider) ||
			typeof provider.available !== "boolean" ||
			!("voices" in provider) ||
			!Array.isArray(provider.voices)
		) {
			return false;
		}
		return provider.voices.every(
			(voice: unknown) =>
				typeof voice === "object" &&
				voice !== null &&
				"id" in voice &&
				typeof voice.id === "string" &&
				"label" in voice &&
				typeof voice.label === "string",
		);
	});
}
