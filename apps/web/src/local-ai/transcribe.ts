import type { TranscriptionResult } from "@/transcription/types";

export async function transcribeMediaLocally({
	file,
	language = "id",
}: {
	file: Blob;
	language?: string;
}): Promise<TranscriptionResult> {
	const response = await fetch("/api/local-ai/transcribe", {
		method: "POST",
		headers: {
			"content-type": file.type || "application/octet-stream",
			"x-opencut-local-ai": "1",
			"x-transcription-language": language,
		},
		body: file,
	});
	const payload: unknown = await response.json();
	if (!response.ok) {
		throw new Error(readError({ payload }) ?? "Transkripsi lokal gagal");
	}
	const result = parseTranscriptionResult({ value: payload });
	if (!result) {
		throw new Error("Respons transkripsi lokal tidak valid");
	}
	return result;
}

function readError({ payload }: { payload: unknown }): string | null {
	if (
		typeof payload !== "object" ||
		payload === null ||
		!("error" in payload)
	) {
		return null;
	}
	return typeof payload.error === "string" ? payload.error : null;
}

function parseTranscriptionResult({
	value,
}: {
	value: unknown;
}): TranscriptionResult | null {
	if (typeof value !== "object" || value === null) return null;
	if (
		!("text" in value) ||
		typeof value.text !== "string" ||
		!("language" in value) ||
		typeof value.language !== "string" ||
		!("segments" in value) ||
		!Array.isArray(value.segments)
	) {
		return null;
	}

	const segments: TranscriptionResult["segments"] = [];
	for (const segment of value.segments) {
		if (
			typeof segment !== "object" ||
			segment === null ||
			!("text" in segment) ||
			typeof segment.text !== "string" ||
			!("start" in segment) ||
			typeof segment.start !== "number" ||
			!("end" in segment) ||
			typeof segment.end !== "number"
		) {
			return null;
		}
		segments.push({
			text: segment.text,
			start: segment.start,
			end: segment.end,
		});
	}

	return {
		text: value.text,
		language: value.language,
		segments,
	};
}
