import type { EditorCore } from "@/core";
import type { TranscriptionSegment } from "@/transcription/types";
import { TICKS_PER_SECOND } from "@/wasm";
import type { EditPlanV1 } from "./editor-adapter";

export interface BridgeTranscript {
	mediaId: string;
	name: string;
	text: string;
	segments: TranscriptionSegment[];
}

export interface BridgeVisualKeyframes {
	mediaId: string;
	name: string;
}

export function buildChatGptBridgePackage({
	editor,
	userPrompt,
	transcripts,
	visualKeyframes = [],
}: {
	editor: EditorCore;
	userPrompt: string;
	transcripts: BridgeTranscript[];
	visualKeyframes?: BridgeVisualKeyframes[];
}): string {
	const { snapshot, timelineHash } = editor.editorAdapter.getProjectSnapshot();
	const activeScene = snapshot.content.scenes.find(
		(scene) => scene.id === snapshot.content.currentSceneId,
	);
	const videoTrack = activeScene?.tracks.find(
		(track) => track.kind === "video",
	);
	const assets = editor.media.getAssets();
	const context = {
		userPrompt,
		ticksPerSecond: TICKS_PER_SECOND,
		projectId: snapshot.projectId,
		baseProjectRevision: snapshot.revision,
		baseTimelineHash: timelineHash,
		visualContactSheet: visualKeyframes.map((item, index) => ({
			row: index + 1,
			mediaId: item.mediaId,
			name: item.name,
			captureRatios: [0.1, 0.5, 0.9],
		})),
		targetVideoTrackId: videoTrack?.id,
		existingElements:
			videoTrack?.elements.map((element) => ({
				elementId: element.id,
				startTicks: element.startTicks,
				durationTicks: element.durationTicks,
			})) ?? [],
		media: snapshot.content.media.map((media) => ({
			...media,
			name: assets.find((asset) => asset.id === media.id)?.name ?? media.id,
			transcript: transcripts.find((item) => item.mediaId === media.id) ?? null,
		})),
	};

	return `Anda adalah editor video. Susun rough cut yang terasa utuh berdasarkan maksud pengguna, isi transkrip, dan contact sheet visual yang diunggah bersama pesan ini. Setiap row contact sheet dipetakan ke mediaId melalui visualContactSheet pada CONTEXT. Pilih hanya bagian yang relevan, hilangkan pengulangan dan jeda yang tidak perlu, serta pertahankan alur pembuka-isi-penutup.

Kembalikan HANYA satu objek JSON EditPlanV1 tanpa markdown atau penjelasan. Maksimal 200 operasi. Gunakan ID yang tersedia persis. Semua waktu adalah integer ticks. resultElementId dan operationId harus unik.

Format wajib:
{"schemaVersion":"1.0","planId":"chatgpt-<unique>","idempotencyKey":"chatgpt-<unique>","projectId":"<context projectId>","baseProjectRevision":0,"baseTimelineHash":"sha256:<hash>","operations":[]}

Operasi yang diperbolehkan:
- {"type":"delete_elements","operationId":"...","elements":[{"trackId":"...","elementId":"..."}]}
- {"type":"insert_segment","operationId":"...","resultElementId":"...","mediaId":"...","targetTrackId":"...","sourceStartTicks":0,"sourceEndTicks":1,"timelineStartTicks":0}
- {"type":"update_output_settings","operationId":"...","canvasWidth":1080,"canvasHeight":1920}

Untuk mengganti rough cut saat ini, hapus semua existingElements dalam satu operasi, lalu insert segmen pilihan secara berurutan mulai timelineStartTicks 0. Jangan mengarang media ID, track ID, timestamp, atau operasi lain.

CONTEXT:
${JSON.stringify(context)}`;
}

export function parseChatGptEditPlan(input: string): EditPlanV1 {
	const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const parsed: unknown = JSON.parse((fenced ?? input).trim());
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!("schemaVersion" in parsed) ||
		!("operations" in parsed) ||
		!Array.isArray(parsed.operations)
	) {
		throw new Error("JSON bukan EditPlanV1 yang valid.");
	}
	// Rust/WASM performs the authoritative strict validation immediately after parse.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return parsed as EditPlanV1;
}
