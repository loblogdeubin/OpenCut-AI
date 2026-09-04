import { DEFAULT_TRACK_NAMES } from "@/timeline/tracks";
import type {
	AudioTrack,
	EffectTrack,
	GraphicTrack,
	TextTrack,
	TrackType,
	TimelineTrack,
	VideoTrack,
} from "@/timeline";

export function buildEmptyTrack({
	id,
	type,
	name,
}: {
	id: string;
	type: "video";
	name?: string;
}): VideoTrack;
export function buildEmptyTrack({
	id,
	type,
	name,
}: {
	id: string;
	type: "text";
	name?: string;
}): TextTrack;
export function buildEmptyTrack({
	id,
	type,
	name,
}: {
	id: string;
	type: "audio";
	name?: string;
}): AudioTrack;
export function buildEmptyTrack({
	id,
	type,
	name,
}: {
	id: string;
	type: "graphic";
	name?: string;
}): GraphicTrack;
export function buildEmptyTrack({
	id,
	type,
	name,
}: {
	id: string;
	type: "effect";
	name?: string;
}): EffectTrack;

export function buildEmptyTrack({
	id,
	type,
	name,
}: {
	id: string;
	type: TrackType;
	name?: string;
}): TimelineTrack;
export function buildEmptyTrack({
	id,
	type,
	name,
}: {
	id: string;
	type: TrackType;
	name?: string;
}): TimelineTrack {
	const trackName = name ?? DEFAULT_TRACK_NAMES[type];

	switch (type) {
		case "video":
			return {
				id,
				name: trackName,
				type: "video",
				elements: [],
				locked: false,
				hidden: false,
				muted: false,
			};
		case "text":
			return {
				id,
				name: trackName,
				type: "text",
				elements: [],
				locked: false,
				hidden: false,
			};
		case "graphic":
			return {
				id,
				name: trackName,
				type: "graphic",
				elements: [],
				locked: false,
				hidden: false,
			};
		case "audio":
			return {
				id,
				name: trackName,
				type: "audio",
				elements: [],
				locked: false,
				muted: false,
			};
		case "effect":
			return {
				id,
				name: trackName,
				type: "effect",
				elements: [],
				locked: false,
				hidden: false,
			};
		default:
			throw new Error(`Unsupported track type: ${type}`);
	}
}
