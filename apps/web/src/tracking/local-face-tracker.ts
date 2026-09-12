export type TrackingPoint = {
	time: number;
	x: number;
	y: number;
	confidence: number;
};
const cache = new Map<string, TrackingPoint[]>();

type Detection = {
	label: string;
	score: number;
	box: { xmin: number; ymin: number; xmax: number; ymax: number };
};
let objectDetectorPromise: Promise<
	(input: string) => Promise<Detection[]>
> | null = null;

async function getObjectDetector() {
	objectDetectorPromise ??= import("@huggingface/transformers").then(
		async ({ pipeline, env }) => {
			env.allowLocalModels = false;
			return (await pipeline("object-detection", "Xenova/detr-resnet-50", {
				device: "wasm",
			})) as unknown as (input: string) => Promise<Detection[]>;
		},
	);
	return objectDetectorPromise;
}

export async function trackSubjectLocally({
	file,
	duration,
	subject,
	signal,
	onProgress,
}: {
	file: File;
	duration: number;
	subject: "person" | "object";
	signal: AbortSignal;
	onProgress: (progress: number) => void;
}): Promise<TrackingPoint[]> {
	const key = `detr:${subject}:${file.name}:${file.size}:${file.lastModified}:${duration}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const detector = await getObjectDetector();
	const video = document.createElement("video");
	const url = URL.createObjectURL(file);
	video.src = url;
	video.muted = true;
	await new Promise<void>((resolve, reject) => {
		video.onloadedmetadata = () => resolve();
		video.onerror = () => reject(new Error("Video could not be decoded."));
	});
	const canvas = document.createElement("canvas");
	canvas.width = Math.min(640, video.videoWidth);
	canvas.height = Math.round(
		(canvas.width * video.videoHeight) / video.videoWidth,
	);
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas is unavailable.");
	const points: TrackingPoint[] = [];
	const step = Math.max(0.35, Math.min(1, duration / 60));
	try {
		for (let time = 0; time <= duration; time += step) {
			if (signal.aborted)
				throw new DOMException("Tracking cancelled", "AbortError");
			video.currentTime = Math.min(time, Math.max(0, video.duration - 0.001));
			await new Promise<void>((resolve) =>
				video.addEventListener("seeked", () => resolve(), { once: true }),
			);
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			const detections = await detector(canvas.toDataURL("image/jpeg", 0.72));
			const matches =
				subject === "person"
					? detections.filter((item) => item.label.toLowerCase() === "person")
					: detections;
			const best = matches
				.filter((item) => item.score >= 0.45)
				.sort((a, b) => b.score - a.score)[0];
			if (best)
				points.push({
					time,
					x:
						(((best.box.xmin + best.box.xmax) / 2) * video.videoWidth) /
						canvas.width,
					y:
						(((best.box.ymin + best.box.ymax) / 2) * video.videoHeight) /
						canvas.height,
					confidence: best.score,
				});
			onProgress(Math.min(1, time / duration));
		}
	} finally {
		URL.revokeObjectURL(url);
	}
	cache.set(key, points);
	onProgress(1);
	return points;
}

export async function trackFaceLocally({
	file,
	duration,
	signal,
	onProgress,
}: {
	file: File;
	duration: number;
	signal: AbortSignal;
	onProgress: (progress: number) => void;
}): Promise<TrackingPoint[]> {
	const FaceDetectorCtor = (
		globalThis as typeof globalThis & {
			FaceDetector?: new (options: {
				maxDetectedFaces: number;
				fastMode: boolean;
			}) => {
				detect(
					source: HTMLVideoElement,
				): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
			};
		}
	).FaceDetector;
	if (!FaceDetectorCtor)
		throw new Error(
			"Face tracking requires Chromium FaceDetector support on this device.",
		);
	const key = `${file.name}:${file.size}:${file.lastModified}:${duration}`;
	const cached = cache.get(key);
	if (cached) return cached;
	const video = document.createElement("video");
	const url = URL.createObjectURL(file);
	video.src = url;
	video.muted = true;
	video.playsInline = true;
	await new Promise<void>((resolve, reject) => {
		video.onloadedmetadata = () => resolve();
		video.onerror = () => reject(new Error("Video could not be decoded."));
	});
	const detector = new FaceDetectorCtor({
		maxDetectedFaces: 1,
		fastMode: true,
	});
	const points: TrackingPoint[] = [];
	const step = Math.max(0.2, Math.min(0.75, duration / 80));
	try {
		for (let time = 0; time <= duration; time += step) {
			if (signal.aborted)
				throw new DOMException("Tracking cancelled", "AbortError");
			video.currentTime = Math.min(time, Math.max(0, video.duration - 0.001));
			await new Promise<void>((resolve) =>
				video.addEventListener("seeked", () => resolve(), { once: true }),
			);
			const face = (await detector.detect(video))[0];
			if (face)
				points.push({
					time,
					x: face.boundingBox.x + face.boundingBox.width / 2,
					y: face.boundingBox.y + face.boundingBox.height / 2,
					confidence: 1,
				});
			onProgress(Math.min(1, time / duration));
		}
	} finally {
		URL.revokeObjectURL(url);
	}
	// The Rust vision core owns trajectory smoothing. The packaged WASM currently
	// lacks that new export, so retain raw detections until WASM is rebuilt.
	cache.set(key, points);
	onProgress(1);
	return points;
}

