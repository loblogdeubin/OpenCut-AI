import { mediaTime, mediaTimeFromSeconds, TICKS_PER_SECOND } from "@/wasm";

export const DEFAULT_NEW_ELEMENT_DURATION = mediaTime({
	ticks: 5 * TICKS_PER_SECOND,
});

export function toElementDurationTicks({
	seconds,
}: {
	seconds: number | null | undefined;
}) {
	// Container metadata is not guaranteed to include a finite duration. In
	// particular, malformed or streaming-like video files can report NaN or
	// Infinity. Never pass either through the WASM time boundary: it throws and
	// would otherwise take down the editor while a clip is being dragged.
	if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
		return DEFAULT_NEW_ELEMENT_DURATION;
	}

	return mediaTimeFromSeconds({ seconds });
}
