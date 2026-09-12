import { removeCanvasBackgroundLocally } from "./local-background-remover";

type Quality = "draft" | "balanced" | "quality";

const MAX_CACHE_FRAMES = 90;
const cache = new Map<string, Promise<HTMLCanvasElement>>();
const previousMask = new Map<string, ImageData>();

function maxEdgeForQuality({ quality }: { quality: Quality }): number {
	if (quality === "draft") return 320;
	if (quality === "quality") return 768;
	return 512;
}

function evictOldFrames(): void {
	while (cache.size > MAX_CACHE_FRAMES) {
		const firstKey = cache.keys().next().value as string | undefined;
		if (!firstKey) return;
		cache.delete(firstKey);
	}
}

function smoothAlpha({
	mediaId,
	current,
}: {
	mediaId: string;
	current: ImageData;
}): ImageData {
	const previous = previousMask.get(mediaId);
	if (
		previous &&
		previous.width === current.width &&
		previous.height === current.height
	) {
		for (let index = 3; index < current.data.length; index += 4) {
			current.data[index] = Math.round(
				current.data[index] * 0.78 + previous.data[index] * 0.22,
			);
		}
	}
	previousMask.set(
		mediaId,
		new ImageData(
			new Uint8ClampedArray(current.data),
			current.width,
			current.height,
		),
	);
	return current;
}

async function processFrame({
	mediaId,
	source,
	quality,
}: {
	mediaId: string;
	source: HTMLCanvasElement | OffscreenCanvas;
	quality: Quality;
}): Promise<HTMLCanvasElement> {
	const maxEdge = maxEdgeForQuality({ quality });
	const ratio = Math.min(1, maxEdge / Math.max(source.width, source.height));
	const inference = document.createElement("canvas");
	inference.width = Math.max(1, Math.round(source.width * ratio));
	inference.height = Math.max(1, Math.round(source.height * ratio));
	inference
		.getContext("2d")
		?.drawImage(source, 0, 0, inference.width, inference.height);

	const segmented = await removeCanvasBackgroundLocally({ canvas: inference });
	const maskCanvas = document.createElement("canvas");
	maskCanvas.width = inference.width;
	maskCanvas.height = inference.height;
	const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
	if (!maskContext) throw new Error("Could not create video mask context.");
	maskContext.drawImage(segmented, 0, 0, maskCanvas.width, maskCanvas.height);
	const pixels = maskContext.getImageData(
		0,
		0,
		maskCanvas.width,
		maskCanvas.height,
	);
	maskContext.putImageData(smoothAlpha({ mediaId, current: pixels }), 0, 0);

	const result = document.createElement("canvas");
	result.width = source.width;
	result.height = source.height;
	const context = result.getContext("2d");
	if (!context) throw new Error("Could not create transparent video frame.");
	context.drawImage(source, 0, 0);
	context.globalCompositeOperation = "destination-in";
	context.imageSmoothingEnabled = true;
	context.drawImage(maskCanvas, 0, 0, result.width, result.height);
	context.globalCompositeOperation = "source-over";
	return result;
}

export async function removeVideoFrameBackground({
	mediaId,
	timeSeconds,
	source,
	quality = "balanced",
}: {
	mediaId: string;
	timeSeconds: number;
	source: HTMLCanvasElement | OffscreenCanvas;
	quality?: Quality;
}): Promise<HTMLCanvasElement> {
	const frameRate = quality === "draft" ? 6 : quality === "quality" ? 15 : 10;
	const frameIndex = Math.round(timeSeconds * frameRate);
	const key = `${mediaId}:${quality}:${frameIndex}`;
	let pending = cache.get(key);
	if (!pending) {
		pending = processFrame({ mediaId, source, quality });
		cache.set(key, pending);
		evictOldFrames();
	}
	return pending;
}

export function clearVideoBackgroundCache({
	mediaId,
}: {
	mediaId?: string;
} = {}): void {
	if (!mediaId) {
		cache.clear();
		previousMask.clear();
		return;
	}
	for (const key of cache.keys()) {
		if (key.startsWith(`${mediaId}:`)) cache.delete(key);
	}
	previousMask.delete(mediaId);
}

