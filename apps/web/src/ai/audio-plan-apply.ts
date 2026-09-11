import type { EditorCore } from "@/core";
import {
	AddMediaAssetCommand,
	AddTrackCommand,
	BatchCommand,
	InsertElementCommand,
	UpsertKeyframeCommand,
	type Command,
} from "@/commands";
import type { AudioPlanV1 } from "@/ai/editor-adapter";
import { validateAudioPlan } from "@/ai/editor-adapter";
import { buildAudioCatalogContract } from "@/ai/audio-director-bridge";
import type { SoundCatalogEntry } from "@/sounds/catalog-types";
import {
	buildSoundAttribution,
	isSoundCatalogEntrySafeForEditing,
} from "@/sounds/catalog";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { mediaTime, mediaTimeFromSeconds } from "@/wasm";

const MAX_AUDIO_DOWNLOAD_BYTES = 64 * 1024 * 1024;

export interface AppliedAudioPlan {
	command: Command;
	insertedCount: number;
	attributions: string[];
}

function extensionForMimeType({ mimeType }: { mimeType: string }): string {
	switch (mimeType) {
		case "audio/wav":
			return "wav";
		case "audio/ogg":
			return "ogg";
		case "audio/webm":
			return "webm";
		default:
			return "mp3";
	}
}

async function downloadCatalogEntry({ entry }: { entry: SoundCatalogEntry }) {
	const source =
		entry.media.downloadUrl ??
		entry.media.previewUrl ??
		entry.media.bundledPath;
	if (!source) throw new Error(`Audio “${entry.title}” tidak memiliki sumber.`);

	const response = await fetch(source);
	if (!response.ok) {
		throw new Error(`Gagal mengunduh “${entry.title}” (${response.status}).`);
	}
	const declaredBytes = Number(response.headers.get("content-length") ?? 0);
	if (declaredBytes > MAX_AUDIO_DOWNLOAD_BYTES) {
		throw new Error(`Audio “${entry.title}” melebihi batas 64 MB.`);
	}
	const blob = await response.blob();
	if (blob.size <= 0 || blob.size > MAX_AUDIO_DOWNLOAD_BYTES) {
		throw new Error(`Ukuran audio “${entry.title}” tidak aman.`);
	}
	const file = new File(
		[blob],
		`${entry.id}.${extensionForMimeType({ mimeType: entry.media.mimeType })}`,
		{ type: entry.media.mimeType },
	);
	const [asset] = await processMediaAssets({ files: [file] });
	if (!asset || asset.type !== "audio" || !asset.duration) {
		throw new Error(`Audio “${entry.title}” tidak dapat diproses.`);
	}
	if (entry.media.sha256 && asset.checksum !== entry.media.sha256) {
		if (asset.url) URL.revokeObjectURL(asset.url);
		throw new Error(`Checksum audio “${entry.title}” tidak cocok.`);
	}
	return asset;
}

function buildVolumeKeyframes({
	operation,
	elementId,
	trackId,
	editor,
}: {
	operation: AudioPlanV1["operations"][number];
	elementId: string;
	trackId: string;
	editor: EditorCore;
}): Command[] {
	const commands: Command[] = [];
	const add = ({ timeTicks, value }: { timeTicks: number; value: number }) => {
		commands.push(
			new UpsertKeyframeCommand({
				trackId,
				elementId,
				propertyPath: "volume",
				time: mediaTime({ ticks: timeTicks }),
				value,
				interpolation: "linear",
			}),
		);
	};

	if (operation.fadeInTicks > 0) {
		add({ timeTicks: 0, value: -60 });
		add({ timeTicks: operation.fadeInTicks, value: operation.gainDb });
	}
	if (operation.fadeOutTicks > 0) {
		add({
			timeTicks: operation.durationTicks - operation.fadeOutTicks,
			value: operation.gainDb,
		});
		add({ timeTicks: operation.durationTicks, value: -60 });
	}

	if (!operation.ducking?.enabled) return commands;
	const scene = editor.scenes.getActiveScene();
	const dialogueTracks = scene.tracks.audio.filter((track) =>
		operation.ducking?.dialogueTrackIds.includes(track.id),
	);
	const clipStart = operation.timelineStartTicks;
	const clipEnd = clipStart + operation.durationTicks;
	for (const element of dialogueTracks.flatMap((track) => track.elements)) {
		const dialogueStart = Math.max(clipStart, element.startTime);
		const dialogueEnd = Math.min(clipEnd, element.startTime + element.duration);
		if (dialogueEnd <= dialogueStart) continue;
		const duckStart = Math.max(
			0,
			dialogueStart - clipStart - operation.ducking.attackTicks,
		);
		const speechStart = dialogueStart - clipStart;
		const speechEnd = dialogueEnd - clipStart;
		const duckEnd = Math.min(
			operation.durationTicks,
			speechEnd + operation.ducking.releaseTicks,
		);
		add({ timeTicks: duckStart, value: operation.gainDb });
		add({ timeTicks: speechStart, value: operation.ducking.targetGainDb });
		add({ timeTicks: speechEnd, value: operation.ducking.targetGainDb });
		add({ timeTicks: duckEnd, value: operation.gainDb });
	}
	return commands;
}

export async function applyAudioPlan({
	editor,
	plan,
	catalogEntries,
}: {
	editor: EditorCore;
	plan: AudioPlanV1;
	catalogEntries: readonly SoundCatalogEntry[];
}): Promise<AppliedAudioPlan> {
	const selectedIds = new Set(
		plan.operations.map((operation) => operation.catalogAssetId),
	);
	const selectedEntries = catalogEntries.filter((entry) =>
		selectedIds.has(entry.id),
	);
	if (selectedEntries.length !== selectedIds.size) {
		throw new Error("Plan memakai audio yang tidak ada di katalog aktif.");
	}
	if (
		selectedEntries.some(
			(entry) => !isSoundCatalogEntrySafeForEditing({ entry }),
		)
	) {
		throw new Error("Plan memakai audio dengan lisensi yang belum aman.");
	}

	const catalog = buildAudioCatalogContract({ entries: catalogEntries });
	const { snapshot } = editor.editorAdapter.getProjectSnapshot();
	const validation = validateAudioPlan({
		snapshot,
		catalog,
		plan,
		phase: "preflight",
	});
	if (!validation.valid) {
		throw new Error(validation.errors.map(({ message }) => message).join("; "));
	}

	const project = editor.project.getActive();
	const processedByCatalogId = new Map(
		await Promise.all(
			selectedEntries.map(
				async (entry) =>
					[entry.id, await downloadCatalogEntry({ entry })] as const,
			),
		),
	);
	const mediaCommands = new Map<string, AddMediaAssetCommand>();
	for (const [catalogId, asset] of processedByCatalogId) {
		mediaCommands.set(
			catalogId,
			new AddMediaAssetCommand({ projectId: project.metadata.id, asset }),
		);
	}

	const scene = editor.scenes.getActiveScene();
	const existingTrackIds = new Set([
		scene.tracks.main.id,
		...scene.tracks.overlay.map((track) => track.id),
		...scene.tracks.audio.map((track) => track.id),
	]);
	const requestedTrackIds = [
		...new Set(plan.operations.map((operation) => operation.targetTrackId)),
	];
	const trackCommands = requestedTrackIds.flatMap((trackId) => {
		if (existingTrackIds.has(trackId)) return [];
		return [
			new AddTrackCommand({
				type: "audio",
				trackId,
				name: trackId === "ai-music" ? "AI Music" : "AI Sound FX",
			}),
		];
	});

	const insertCommands: Command[] = [];
	for (const operation of plan.operations) {
		const entry = selectedEntries.find(
			(candidate) => candidate.id === operation.catalogAssetId,
		);
		const processed = processedByCatalogId.get(operation.catalogAssetId);
		const mediaCommand = mediaCommands.get(operation.catalogAssetId);
		if (!entry || !processed || !mediaCommand) {
			throw new Error("Audio plan kehilangan media yang sudah diproses.");
		}
		const sourceDuration = mediaTimeFromSeconds({
			seconds: processed.duration ?? entry.durationSeconds,
		});
		const element = buildElementFromMedia({
			mediaId: mediaCommand.getAssetId(),
			mediaType: "audio",
			name: entry.title,
			duration: mediaTime({ ticks: operation.durationTicks }),
			startTime: mediaTime({ ticks: operation.timelineStartTicks }),
		});
		if (element.type !== "audio") continue;
		element.sourceDuration = sourceDuration;
		element.trimStart = mediaTime({ ticks: operation.sourceStartTicks });
		element.trimEnd = mediaTime({
			ticks: Math.max(
				0,
				sourceDuration - operation.sourceStartTicks - operation.durationTicks,
			),
		});
		element.params = { ...element.params, volume: operation.gainDb };
		const insert = new InsertElementCommand({
			element,
			elementId: operation.resultElementId,
			placement: { mode: "explicit", trackId: operation.targetTrackId },
		});
		insertCommands.push(insert);
		insertCommands.push(
			...buildVolumeKeyframes({
				operation,
				elementId: operation.resultElementId,
				trackId: operation.targetTrackId,
				editor,
			}),
		);
	}

	const command = new BatchCommand([
		...mediaCommands.values(),
		...trackCommands,
		...insertCommands,
	]);
	editor.command.execute({ command });
	return {
		command,
		insertedCount: plan.operations.length,
		attributions: buildSoundAttribution({ entries: selectedEntries }),
	};
}
