import {
	VisualNode,
	type ResolvedVisualSourceNodeState,
	type VisualNodeParams,
} from "./visual-node";

export interface ImageNodeParams extends VisualNodeParams {
	url: string;
	maxSourceSize?: number;
}

export interface CachedImageSource {
	source: HTMLImageElement | OffscreenCanvas;
	width: number;
	height: number;
}

const imageSourceCache = new Map<string, Promise<CachedImageSource>>();
const MAX_CACHED_IMAGE_SOURCES = 12;

function touchCachedImage({
	cacheKey,
	promise,
}: {
	cacheKey: string;
	promise: Promise<CachedImageSource>;
}): void {
	imageSourceCache.delete(cacheKey);
	imageSourceCache.set(cacheKey, promise);
}

function evictOldImageSources(): void {
	while (imageSourceCache.size > MAX_CACHED_IMAGE_SOURCES) {
		const oldestCacheKey = imageSourceCache.keys().next().value;
		if (!oldestCacheKey) return;
		imageSourceCache.delete(oldestCacheKey);
	}
}

export function loadImageSource({
	url,
	maxSourceSize,
}: {
	url: string;
	maxSourceSize?: number;
}): Promise<CachedImageSource> {
	const cacheKey = `${url}::${maxSourceSize ?? "full"}`;

	const cached = imageSourceCache.get(cacheKey);
	if (cached) {
		touchCachedImage({ cacheKey, promise: cached });
		return cached;
	}

	const pending = (async (): Promise<CachedImageSource> => {
		const image = new Image();

		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error("Image load failed"));
			image.src = url;
		});

		const naturalWidth = image.naturalWidth;
		const naturalHeight = image.naturalHeight;
		const exceedsLimit =
			maxSourceSize &&
			(naturalWidth > maxSourceSize || naturalHeight > maxSourceSize);

		if (exceedsLimit) {
			const scale = Math.min(
				maxSourceSize / naturalWidth,
				maxSourceSize / naturalHeight,
			);
			const scaledWidth = Math.round(naturalWidth * scale);
			const scaledHeight = Math.round(naturalHeight * scale);

			const offscreen = new OffscreenCanvas(scaledWidth, scaledHeight);
			const ctx = offscreen.getContext("2d");

			if (ctx) {
				ctx.drawImage(image, 0, 0, scaledWidth, scaledHeight);
				return { source: offscreen, width: scaledWidth, height: scaledHeight };
			}
		}

		return { source: image, width: naturalWidth, height: naturalHeight };
	})();
	const promise = pending.catch((error) => {
		if (imageSourceCache.get(cacheKey) === promise) {
			imageSourceCache.delete(cacheKey);
		}
		throw error;
	});

	imageSourceCache.set(cacheKey, promise);
	evictOldImageSources();
	return promise;
}

export class ImageNode extends VisualNode<
	ImageNodeParams,
	ResolvedVisualSourceNodeState
> {}
