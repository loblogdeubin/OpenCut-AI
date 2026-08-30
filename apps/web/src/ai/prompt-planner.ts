import type { EditorCore } from "@/core";
import { buildWaveformSourceKey } from "@/media/waveform-summary";
import { waveformCache } from "@/services/waveform-cache/service";
import { generateUUID } from "@/utils/id";
import { mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";
import {
	detectAudibleRanges,
	type AudibleRangeV1,
	type EditOperationV1,
	type EditPlanV1,
} from "./editor-adapter";

export interface RoughCutPlanPreview {
	plan: EditPlanV1;
	mediaCount: number;
	segmentCount: number;
	replacedElementCount: number;
	expectedDurationTicks: number;
	removedSilenceTicks: number;
	warnings: string[];
	intent: {
		removeSilence: boolean;
		aspectRatio: "16:9" | "9:16" | "1:1" | null;
		maxDurationSeconds: number | null;
	};
}

function parseMaxDurationSeconds(prompt: string): number | null {
	const match = prompt.match(
		/(?:maksimal|max(?:imum)?|durasi)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(menit|minute|minutes|detik|second|seconds)/i,
	);
	if (!match) return null;
	const value = Number.parseFloat(match[1].replace(",", "."));
	if (!Number.isFinite(value) || value <= 0) return null;
	return /menit|minute/i.test(match[2]) ? value * 60 : value;
}

function parseAspectRatio(prompt: string): "16:9" | "9:16" | "1:1" | null {
	if (/9\s*:\s*16|vertikal|vertical/i.test(prompt)) return "9:16";
	if (/1\s*:\s*1|persegi|square/i.test(prompt)) return "1:1";
	if (/16\s*:\s*9|horizontal|landscape/i.test(prompt)) return "16:9";
	return null;
}

async function getSourceRanges({
	asset,
	removeSilence,
	warnings,
}: {
	asset: ReturnType<EditorCore["media"]["getAssets"]>[number];
	removeSilence: boolean;
	warnings: string[];
}): Promise<AudibleRangeV1[]> {
	if (!asset.duration || asset.duration <= 0) {
		warnings.push(`${asset.name}: durasi media tidak tersedia, clip dilewati.`);
		return [];
	}
	const totalDurationTicks = mediaTimeFromSeconds({ seconds: asset.duration });
	if (!removeSilence || asset.hasAudio === false) {
		return [{ startTicks: 0, endTicks: totalDurationTicks }];
	}

	try {
		const summary = await waveformCache.getSourceSummary({
			sourceKey: buildWaveformSourceKey({ kind: "media", id: asset.id }),
			sourceFile: asset.file,
		});
		const ranges = detectAudibleRanges({
			amplitudes: Array.from(summary.amplitudes),
			sampleRate: summary.sampleRate,
			bucketSize: summary.bucketSize,
			totalDurationTicks,
			ticksPerSecond: TICKS_PER_SECOND,
			threshold: 0.012,
			minSilenceTicks: mediaTimeFromSeconds({ seconds: 2 }),
			paddingTicks: mediaTimeFromSeconds({ seconds: 0.15 }),
			minSegmentTicks: mediaTimeFromSeconds({ seconds: 0.35 }),
		});
		if (ranges.length === 0) {
			warnings.push(
				`${asset.name}: tidak menemukan bagian audio yang terdengar.`,
			);
		}
		return ranges;
	} catch {
		warnings.push(
			`${asset.name}: audio tidak dapat dianalisis; clip dipakai utuh tanpa trim silence.`,
		);
		return [{ startTicks: 0, endTicks: totalDurationTicks }];
	}
}

function aspectOperation({
	aspectRatio,
}: {
	aspectRatio: "16:9" | "9:16" | "1:1" | null;
}): EditOperationV1 | null {
	if (!aspectRatio) return null;
	const size =
		aspectRatio === "9:16"
			? { width: 1080, height: 1920 }
			: aspectRatio === "1:1"
				? { width: 1080, height: 1080 }
				: { width: 1920, height: 1080 };
	return {
		type: "update_output_settings",
		operationId: "set-output-aspect",
		canvasWidth: size.width,
		canvasHeight: size.height,
	};
}

export async function buildLocalRoughCutPlan({
	editor,
	prompt,
}: {
	editor: EditorCore;
	prompt: string;
}): Promise<RoughCutPlanPreview> {
	if (!prompt.trim()) throw new Error("Tulis instruksi edit terlebih dahulu.");
	const assets = editor.media
		.getAssets()
		.filter((asset) => asset.type === "video");
	if (assets.length === 0) {
		throw new Error("Import minimal satu footage video sebelum membuat plan.");
	}

	const removeSilence = /diam|hening|silence|jeda/i.test(prompt);
	const aspectRatio = parseAspectRatio(prompt);
	const maxDurationSeconds = parseMaxDurationSeconds(prompt);
	const maxDurationTicks = maxDurationSeconds
		? mediaTimeFromSeconds({ seconds: maxDurationSeconds })
		: null;
	const warnings: string[] = [
		"Planner lokal MVP menyusun footage berdasarkan urutan import; pemilihan take semantik memerlukan transkripsi/ChatGPT pada tahap berikutnya.",
	];
	const { snapshot, timelineHash } = editor.editorAdapter.getProjectSnapshot();
	const project = editor.project.getActive();
	const mainScene = project.scenes.find(
		(scene) => scene.id === project.currentSceneId,
	);
	if (!mainScene) throw new Error("Scene aktif tidak ditemukan.");
	const targetTrack = mainScene.tracks.main;
	const existingElements = targetTrack.elements.map((element) => ({
		trackId: targetTrack.id,
		elementId: element.id,
	}));
	const planId = generateUUID();
	const operations: EditOperationV1[] = [];
	if (existingElements.length > 0) {
		operations.push({
			type: "delete_elements",
			operationId: "replace-main-timeline",
			elements: existingElements,
		});
	}

	let timelineCursor = 0;
	let sourceDuration = 0;
	let segmentCount = 0;
	outer: for (const [assetIndex, asset] of assets.entries()) {
		const ranges = await getSourceRanges({ asset, removeSilence, warnings });
		if (asset.duration) {
			sourceDuration += mediaTimeFromSeconds({ seconds: asset.duration });
		}
		for (const [rangeIndex, range] of ranges.entries()) {
			if (operations.length >= 198) {
				warnings.push("Plan dibatasi ke 198 operasi insert untuk keamanan.");
				break outer;
			}
			const remaining =
				maxDurationTicks === null ? null : maxDurationTicks - timelineCursor;
			if (remaining !== null && remaining <= 0) break outer;
			const rangeDuration = range.endTicks - range.startTicks;
			const usedDuration =
				remaining === null ? rangeDuration : Math.min(rangeDuration, remaining);
			if (usedDuration <= 0) continue;
			operations.push({
				type: "insert_segment",
				operationId: `insert-${assetIndex + 1}-${rangeIndex + 1}`,
				resultElementId: `ai-${planId}-${assetIndex + 1}-${rangeIndex + 1}`,
				mediaId: asset.id,
				targetTrackId: targetTrack.id,
				sourceStartTicks: range.startTicks,
				sourceEndTicks: range.startTicks + usedDuration,
				timelineStartTicks: timelineCursor,
			});
			timelineCursor += usedDuration;
			segmentCount += 1;
		}
	}

	const outputOperation = aspectOperation({ aspectRatio });
	if (outputOperation) operations.push(outputOperation);
	if (segmentCount === 0) {
		throw new Error("Tidak ada segmen footage yang dapat dimasukkan ke plan.");
	}
	const plan: EditPlanV1 = {
		schemaVersion: "1.0",
		planId,
		idempotencyKey: `prompt-${planId}`,
		projectId: snapshot.projectId,
		baseProjectRevision: snapshot.revision,
		baseTimelineHash: timelineHash,
		operations,
	};
	const validation = editor.editorAdapter.validatePlan({ plan });
	if (!validation.valid) {
		throw new Error(validation.errors.map((error) => error.message).join("; "));
	}

	return {
		plan,
		mediaCount: assets.length,
		segmentCount,
		replacedElementCount: existingElements.length,
		expectedDurationTicks: timelineCursor,
		removedSilenceTicks: Math.max(0, sourceDuration - timelineCursor),
		warnings,
		intent: { removeSilence, aspectRatio, maxDurationSeconds },
	};
}
