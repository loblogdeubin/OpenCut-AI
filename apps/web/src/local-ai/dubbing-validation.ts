import type { LocalDubbingSynthesisRequest } from "@/local-ai/types";

export const MAX_DUBBING_TEXT_CHARACTERS = 5_000;
export const MAX_DUBBING_REQUEST_BYTES = 32 * 1024;

const VOICE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
function containsUnsafeTextControlCharacter({ text }: { text: string }) {
	for (const character of text) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (
			codePoint === 0x7f ||
			(codePoint <= 0x1f &&
				codePoint !== 0x09 &&
				codePoint !== 0x0a &&
				codePoint !== 0x0d)
		) {
			return true;
		}
	}
	return false;
}

export class DubbingRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DubbingRequestError";
	}
}

export function isSafeDubbingVoiceId({ voice }: { voice: string }): boolean {
	return VOICE_ID_PATTERN.test(voice);
}

export function parseDubbingSynthesisRequest({
	value,
}: {
	value: unknown;
}): LocalDubbingSynthesisRequest {
	if (typeof value !== "object" || value === null) {
		throw new DubbingRequestError("Permintaan dubber tidak valid");
	}

	const text =
		"text" in value && typeof value.text === "string" ? value.text.trim() : "";
	if (!text) {
		throw new DubbingRequestError("Teks dubber wajib diisi");
	}
	if (text.length > MAX_DUBBING_TEXT_CHARACTERS) {
		throw new DubbingRequestError(
			`Teks dubber maksimal ${MAX_DUBBING_TEXT_CHARACTERS} karakter`,
		);
	}
	if (containsUnsafeTextControlCharacter({ text })) {
		throw new DubbingRequestError(
			"Teks dubber mengandung karakter tidak valid",
		);
	}

	let voice: string | undefined;
	if ("voice" in value && value.voice !== undefined) {
		if (
			typeof value.voice !== "string" ||
			!isSafeDubbingVoiceId({ voice: value.voice })
		) {
			throw new DubbingRequestError("Voice dubber tidak valid");
		}
		voice = value.voice;
	}
	let provider: LocalDubbingSynthesisRequest["provider"];
	if ("provider" in value && value.provider !== undefined) {
		if (value.provider !== "windows-sapi" && value.provider !== "piper") {
			throw new DubbingRequestError("Provider dubber tidak valid");
		}
		provider = value.provider;
	}

	return {
		text,
		...(provider ? { provider } : {}),
		...(voice ? { voice } : {}),
	};
}
