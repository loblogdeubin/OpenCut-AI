import type { EditorCore } from "@/core";
import {
	AddMediaAssetCommand,
	AddTrackCommand,
	BatchCommand,
	InsertElementCommand,
	UpdateElementsCommand,
	type Command,
} from "@/commands";
import { synthesizeDubbingLocally } from "@/local-ai/dubbing";
import type { LocalDubbingProvider } from "@/local-ai/types";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import type { TextElement } from "@/timeline";
import { mediaTimeFromSeconds } from "@/wasm";

const DUBBING_TRACK_ID = "ai-dubber";

export interface TimelineDubbingResult {
	command: Command;
	insertedCount: number;
	provider: LocalDubbingProvider;
	voice: string;
}

interface CaptionForDubbing {
	text: string;
	startTime: TextElement["startTime"];
	duration: TextElement["duration"];
}

export function collectCaptionsForDubbing({
	editor,
}: {
	editor: EditorCore;
}): CaptionForDubbing[] {
	return editor.scenes
		.getActiveScene()
		.tracks.overlay.filter((track) => track.type === "text")
		.flatMap((track) => track.elements)
		.filter((element) => /^Caption \d+$/.test(element.name))
		.flatMap((element) => {
			const content = element.params.content;
			if (typeof content !== "string" || !content.trim()) return [];
			return [
				{
					text: content.trim(),
					startTime: element.startTime,
					duration: element.duration,
				},
			];
		})
		.sort((left, right) => left.startTime - right.startTime);
}

export async function applyLocalDubbingFromCaptions({
	editor,
	provider,
	voice,
	muteOriginalAudio,
	onProgress,
}: {
	editor: EditorCore;
	provider?: LocalDubbingProvider;
	voice?: string;
	muteOriginalAudio: boolean;
	onProgress?: ({
		completed,
		total,
	}: {
		completed: number;
		total: number;
	}) => void;
}): Promise<TimelineDubbingResult> {
	const captions = collectCaptionsForDubbing({ editor });
	if (captions.length === 0) {
		throw new Error(
			"Belum ada subtitle di timeline. Buat subtitle Indonesia terlebih dahulu.",
		);
	}
	if (captions.some((caption) => caption.duration <= 0)) {
		throw new Error("Ada blok subtitle dengan durasi nol atau negatif.");
	}
	const project = editor.project.getActive();
	const mediaCommands: AddMediaAssetCommand[] = [];
	const insertCommands: InsertElementCommand[] = [];
	let selectedProvider: LocalDubbingProvider | undefined;
	let selectedVoice: string | undefined;

	for (const [index, caption] of captions.entries()) {
		const synthesized = await synthesizeDubbingLocally({
			text: caption.text,
			provider,
			voice,
		});
		selectedProvider = synthesized.provider;
		selectedVoice = synthesized.voice;
		const file = new File([synthesized.audio], `dub-${index + 1}.wav`, {
			type: "audio/wav",
		});
		const [asset] = await processMediaAssets({ files: [file] });
		if (!asset || asset.type !== "audio" || !asset.duration) {
			throw new Error(`Dub subtitle ${index + 1} tidak dapat diproses.`);
		}
		const mediaCommand = new AddMediaAssetCommand({
			projectId: project.metadata.id,
			asset,
		});
		const sourceDuration = mediaTimeFromSeconds({ seconds: asset.duration });
		const element = buildElementFromMedia({
			mediaId: mediaCommand.getAssetId(),
			mediaType: "audio",
			name: `Dub ${index + 1}`,
			duration: caption.duration,
			startTime: caption.startTime,
		});
		if (element.type !== "audio") {
			throw new Error("Elemen dubber bukan audio.");
		}
		element.sourceDuration = sourceDuration;
		element.retime = {
			rate: Math.max(0.05, sourceDuration / caption.duration),
			maintainPitch: true,
		};
		element.params = { ...element.params, volume: -3 };
		mediaCommands.push(mediaCommand);
		insertCommands.push(
			new InsertElementCommand({
				element,
				placement: { mode: "explicit", trackId: DUBBING_TRACK_ID },
			}),
		);
		onProgress?.({ completed: index + 1, total: captions.length });
	}

	if (!selectedProvider || !selectedVoice) {
		throw new Error("Dubber lokal tidak menghasilkan voice.");
	}
	const scene = editor.scenes.getActiveScene();
	const commands: Command[] = [...mediaCommands];
	if (!scene.tracks.audio.some((track) => track.id === DUBBING_TRACK_ID)) {
		commands.push(
			new AddTrackCommand({
				type: "audio",
				trackId: DUBBING_TRACK_ID,
				name: "AI Dubber",
			}),
		);
	}
	commands.push(...insertCommands);
	if (muteOriginalAudio) {
		const updates = [scene.tracks.main, ...scene.tracks.overlay]
			.filter((track) => track.type === "video")
			.flatMap((track) =>
				track.elements
					.filter((element) => element.type === "video")
					.map((element) => ({
						trackId: track.id,
						elementId: element.id,
						patch: { isSourceAudioEnabled: false },
					})),
			);
		if (updates.length > 0)
			commands.push(new UpdateElementsCommand({ updates }));
	}

	const command = new BatchCommand(commands);
	editor.command.execute({ command });
	return {
		command,
		insertedCount: captions.length,
		provider: selectedProvider,
		voice: selectedVoice,
	};
}
