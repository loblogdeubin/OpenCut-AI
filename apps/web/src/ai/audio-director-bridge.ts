import type { EditorCore } from "@/core";
import type {
	AudioCatalogV1,
	AudioPlanV1,
} from "@/ai/editor-adapter/contracts";
import { parseAudioPlanV1 } from "@/ai/editor-adapter/audio-plan";
import type { BridgeTranscript } from "@/ai/chatgpt-bridge";
import type { SoundCatalogEntry } from "@/sounds/catalog-types";
import { isSoundCatalogEntrySafeForEditing } from "@/sounds/catalog";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";

const MAX_BRIDGE_CATALOG_ENTRIES = 80;

export function buildAudioCatalogContract({
	entries,
	mediaIds = {},
}: {
	entries: readonly SoundCatalogEntry[];
	mediaIds?: Readonly<Record<string, string>>;
}): AudioCatalogV1 {
	return {
		schemaVersion: "1.0",
		catalogId: "opencut.ai-audio",
		revision: 1,
		assets: entries.map((entry) => ({
			id: entry.id,
			mediaId: mediaIds[entry.id] ?? null,
			kind: entry.kind,
			durationTicks: mediaTimeFromSeconds({
				seconds: entry.durationSeconds,
			}),
			license: {
				licenseId: entry.license.licenseId,
				licenseName: entry.license.licenseName,
				sourceUrl: entry.license.sourceUrl,
				licenseUrl: entry.license.licenseUrl,
				creator: entry.license.creator,
				attributionRequired: entry.license.attributionRequired,
				attributionText: entry.license.attributionText ?? null,
				commercialUseAllowed: entry.license.commercialUseAllowed,
				derivativeUseAllowed: entry.license.derivativeUseAllowed,
				reviewStatus: entry.license.reviewStatus,
				reviewedAt: entry.license.reviewedAt ?? null,
			},
		})),
	};
}

export function buildAudioDirectorBridgePackage({
	editor,
	userPrompt,
	transcripts,
	catalogEntries,
}: {
	editor: EditorCore;
	userPrompt: string;
	transcripts: BridgeTranscript[];
	catalogEntries: readonly SoundCatalogEntry[];
}): string {
	const { snapshot, timelineHash } = editor.editorAdapter.getProjectSnapshot();
	const scene = snapshot.content.scenes.find(
		(candidate) => candidate.id === snapshot.content.currentSceneId,
	);
	if (!scene) throw new Error("Scene aktif tidak ditemukan.");

	const safeEntries = catalogEntries
		.filter((entry) => isSoundCatalogEntrySafeForEditing({ entry }))
		.slice(0, MAX_BRIDGE_CATALOG_ENTRIES);
	if (safeEntries.length === 0) {
		throw new Error(
			"Katalog belum memiliki audio dengan lisensi komersial dan modifikasi yang sudah diverifikasi.",
		);
	}

	const catalog = buildAudioCatalogContract({ entries: safeEntries });
	const visualElements = scene.tracks
		.filter((track) => track.kind === "video")
		.flatMap((track) => track.elements)
		.sort((left, right) => left.startTicks - right.startTicks);
	const cutPoints = [
		...new Set(
			visualElements.flatMap((element) => [
				element.startTicks,
				element.startTicks + element.durationTicks,
			]),
		),
	]
		.filter((timeTicks) => timeTicks > 0)
		.sort((left, right) => left - right);
	const context = {
		userPrompt,
		ticksPerSecond: TICKS_PER_SECOND,
		projectId: snapshot.projectId,
		baseProjectRevision: snapshot.revision,
		baseTimelineHash: timelineHash,
		catalogId: catalog.catalogId,
		catalogRevision: catalog.revision,
		projectDurationTicks: editor.timeline.getTotalDuration(),
		targetTracks: {
			music: "ai-music",
			sfx: "ai-sfx",
		},
		cutPoints,
		transcripts,
		catalog: safeEntries.map((entry) => ({
			id: entry.id,
			title: entry.title,
			kind: entry.kind,
			durationTicks: mediaTimeFromSeconds({
				seconds: entry.durationSeconds,
			}),
			bpm: entry.bpm ?? null,
			moods: entry.moods,
			themes: entry.themes,
			tags: entry.tags,
			attributionRequired: entry.license.attributionRequired,
		})),
	};
	const requiredPlanEnvelope = {
		schemaVersion: "1.0",
		planId: "audio-<unique>",
		idempotencyKey: "audio-<unique>",
		projectId: snapshot.projectId,
		baseProjectRevision: snapshot.revision,
		baseTimelineHash: timelineHash,
		catalogId: catalog.catalogId,
		catalogRevision: catalog.revision,
		operations: [],
	};

	return `Anda adalah AI Audio Director untuk editor video. Pilih hanya audio dari katalog CONTEXT, sesuaikan musik dan sound effect dengan tema besar, transkrip, ritme, serta titik cut video. Jangan mengarang catalogAssetId atau track ID.

Kembalikan HANYA satu objek JSON AudioPlanV1 tanpa markdown atau penjelasan. Maksimal 60 operasi. Gunakan transition SFX hanya pada cut yang penting dan beri jarak agar hasil tidak berisik. Musik normalnya sekitar -24 sampai -16 dB; SFX sekitar -18 sampai -8 dB. Semua waktu wajib integer ticks, tidak negatif, dan tidak boleh melewati durasi sumber audio. Fade-in + fade-out tidak boleh melebihi durasi clip.

Envelope wajib (salin nilai project/revision/hash/catalog persis seperti ini, lalu isi operations):
${JSON.stringify(requiredPlanEnvelope)}

Operasi yang diperbolehkan:
{"type":"insert_catalog_audio","operationId":"...","resultElementId":"...","catalogAssetId":"...","targetTrackId":"<context targetTracks.music atau targetTracks.sfx>","timelineStartTicks":0,"sourceStartTicks":0,"durationTicks":1,"gainDb":-18,"fadeInTicks":0,"fadeOutTicks":0,"ducking":null}

Untuk background music, targetTrackId harus targetTracks.music. Untuk sound effect dan transition sound gunakan targetTracks.sfx. Jika katalog tidak menyediakan jenis yang cocok, jangan paksa dan jangan membuat ID baru. Jangan sertakan dubbing pada AudioPlan; dubbing diproses lokal dari subtitle agar persetujuan suara dan timing tetap terkontrol.

CONTEXT:
${JSON.stringify(context)}`;
}

export function parseChatGptAudioPlan({
	input,
}: {
	input: string;
}): AudioPlanV1 {
	return parseAudioPlanV1({ input });
}
