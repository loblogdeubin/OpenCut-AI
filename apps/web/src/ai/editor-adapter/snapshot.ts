import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";
import type { TimelineElement, TimelineTrack, TScene } from "@/timeline/types";
import { mediaTimeFromSeconds } from "@/wasm";
import {
	PROJECT_CONTENT_SCHEMA_VERSION,
	type ElementV1,
	type JsonValue,
	type MediaAssetV1,
	type ProjectContentV1,
	type ProjectSnapshotV1,
	type SceneV1,
	type TrackV1,
} from "./contracts";

function toJsonValue({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): JsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new Error(`Non-finite number at ${path}`);
		}
		return Object.is(value, -0) ? 0 : value;
	}
	if (Array.isArray(value)) {
		return value.map((entry, index) =>
			toJsonValue({ value: entry, path: `${path}[${index}]` }),
		);
	}
	if (typeof value === "object") {
		const output: Record<string, JsonValue> = {};
		for (const [key, entry] of Object.entries(value)) {
			if (entry === undefined || key === "buffer" || key === "url") continue;
			output[key] = toJsonValue({ value: entry, path: `${path}.${key}` });
		}
		return output;
	}
	throw new Error(`Unsupported value at ${path}`);
}

function getSemanticData(element: TimelineElement): Record<string, JsonValue> {
	const data: Record<string, unknown> = {
		params: element.params,
		animations: element.animations,
	};
	if ("hidden" in element) data.hidden = element.hidden;
	if ("retime" in element) data.retime = element.retime;
	if ("effects" in element) data.effects = element.effects;
	if ("masks" in element) data.masks = element.masks;
	if (element.type === "video") {
		data.isSourceAudioEnabled = element.isSourceAudioEnabled;
	}
	if (element.type === "audio") data.sourceType = element.sourceType;
	if (element.type === "sticker") {
		data.stickerId = element.stickerId;
		data.intrinsicWidth = element.intrinsicWidth;
		data.intrinsicHeight = element.intrinsicHeight;
	}
	if (element.type === "graphic") data.definitionId = element.definitionId;
	if (element.type === "effect") data.effectType = element.effectType;
	return toJsonValue({ value: data, path: `element.${element.id}` }) as Record<
		string,
		JsonValue
	>;
}

function mapElement(element: TimelineElement): ElementV1 {
	return {
		id: element.id,
		kind: element.type,
		mediaId: "mediaId" in element ? element.mediaId : null,
		startTicks: element.startTime,
		durationTicks: element.duration,
		trimStartTicks: element.trimStart,
		trimEndTicks: element.trimEnd,
		sourceDurationTicks: element.sourceDuration ?? null,
		semanticData: getSemanticData(element),
	};
}

function mapTrack(track: TimelineTrack): TrackV1 {
	return {
		id: track.id,
		kind: track.type,
		muted: "muted" in track ? track.muted : null,
		hidden: "hidden" in track ? track.hidden : null,
		elements: track.elements.map(mapElement),
	};
}

function mapScene(scene: TScene): SceneV1 {
	return {
		id: scene.id,
		isMain: scene.isMain,
		tracks: [
			mapTrack(scene.tracks.main),
			...scene.tracks.overlay.map(mapTrack),
			...scene.tracks.audio.map(mapTrack),
		],
		bookmarks: scene.bookmarks.map((bookmark) => ({
			timeTicks: bookmark.time,
			durationTicks: bookmark.duration ?? null,
			note: bookmark.note ?? null,
			color: bookmark.color ?? null,
		})),
	};
}

function mapMedia(asset: MediaAsset): MediaAssetV1 {
	return {
		id: asset.id,
		kind: asset.type,
		durationTicks:
			asset.duration === undefined
				? null
				: mediaTimeFromSeconds({ seconds: asset.duration }),
		checksum: null,
	};
}

export function projectToContentV1({
	project,
	mediaAssets,
}: {
	project: TProject;
	mediaAssets: MediaAsset[];
}): ProjectContentV1 {
	return {
		schemaVersion: PROJECT_CONTENT_SCHEMA_VERSION,
		currentSceneId: project.currentSceneId,
		settings: {
			fpsNumerator: project.settings.fps.numerator,
			fpsDenominator: project.settings.fps.denominator,
			canvasWidth: project.settings.canvasSize.width,
			canvasHeight: project.settings.canvasSize.height,
			background: toJsonValue({
				value: project.settings.background,
				path: "settings.background",
			}) as Record<string, JsonValue>,
		},
		scenes: project.scenes.map(mapScene),
		media: mediaAssets.map(mapMedia),
	};
}

export function projectToSnapshotV1({
	project,
	mediaAssets,
}: {
	project: TProject;
	mediaAssets: MediaAsset[];
}): ProjectSnapshotV1 {
	return {
		schemaVersion: PROJECT_CONTENT_SCHEMA_VERSION,
		projectId: project.metadata.id,
		revision: project.revision,
		content: projectToContentV1({ project, mediaAssets }),
	};
}
