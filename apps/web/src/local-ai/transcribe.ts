import type { TranscriptionResult } from "@/transcription/types";

export async function transcribeMediaLocally({
	file,
	language = "id",
}: {
	file: File;
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
	const payload = (await response.json()) as TranscriptionResult & {
		error?: string;
	};
	if (!response.ok) throw new Error(payload.error ?? "Transkripsi lokal gagal");
	return payload;
}
