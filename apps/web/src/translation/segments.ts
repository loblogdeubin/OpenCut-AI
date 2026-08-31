import type { TranscriptionSegment } from "@/transcription/types";

export function applySegmentTranslations({
	segments,
	translations,
}: {
	segments: TranscriptionSegment[];
	translations: string[];
}): TranscriptionSegment[] {
	if (segments.length !== translations.length) {
		throw new Error(
			"Jumlah hasil terjemahan tidak sesuai dengan segmen subtitle",
		);
	}

	return segments.map((segment, index) => {
		const translatedText = translations[index]?.trim();
		if (!translatedText) {
			throw new Error(`Terjemahan segmen ${index + 1} kosong`);
		}
		return {
			...segment,
			text: translatedText,
		};
	});
}
