import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";

export interface VisualKeyframeStrip {
	mediaId: string;
	name: string;
	blob: Blob;
	previewUrl: string;
}

export async function extractKeyframesLocally({
	file,
}: {
	file: File;
}): Promise<Blob> {
	try {
		const response = await fetch("/api/local-ai/keyframes", {
			method: "POST",
			headers: {
				"content-type": file.type || "application/octet-stream",
				"x-opencut-local-ai": "1",
			},
			body: file,
		});
		if (response.ok) return response.blob();
	} catch {
		// The browser decoder below is the portable fallback.
	}
	return extractKeyframesInBrowser({ file });
}

async function extractKeyframesInBrowser({
	file,
}: {
	file: File;
}): Promise<Blob> {
	const input = new Input({
		source: new BlobSource(file),
		formats: ALL_FORMATS,
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track || !(await track.canDecode())) {
			throw new Error(
				"Format video tidak dapat didekode untuk keyframe visual",
			);
		}
		const duration = await input.computeDuration();
		if (!Number.isFinite(duration) || duration <= 0) {
			throw new Error("Durasi footage tidak dapat dibaca");
		}
		const sink = new VideoSampleSink(track);
		const canvas = document.createElement("canvas");
		canvas.width = 960;
		canvas.height = 180;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Canvas keyframe tidak tersedia");
		context.fillStyle = "#000";
		context.fillRect(0, 0, canvas.width, canvas.height);
		for (const [index, ratio] of [0.1, 0.5, 0.9].entries()) {
			const sample = await sink.getSample(Math.max(0, duration * ratio));
			if (!sample) continue;
			try {
				const scale = Math.min(
					320 / sample.displayWidth,
					180 / sample.displayHeight,
				);
				const width = Math.max(1, Math.round(sample.displayWidth * scale));
				const height = Math.max(1, Math.round(sample.displayHeight * scale));
				sample.draw(
					context,
					index * 320 + (320 - width) / 2,
					(180 - height) / 2,
					width,
					height,
				);
			} finally {
				sample.close();
			}
		}
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) =>
					blob
						? resolve(blob)
						: reject(new Error("Gagal membuat keyframe visual")),
				"image/jpeg",
				0.88,
			);
		});
	} finally {
		input.dispose();
	}
}

export async function buildVisualContactSheet(
	strips: VisualKeyframeStrip[],
): Promise<Blob> {
	if (strips.length === 0) throw new Error("Belum ada keyframe visual.");
	const bitmaps = await Promise.all(
		strips.map(async (strip) => createImageBitmap(strip.blob)),
	);
	const width = 960;
	const headingHeight = 36;
	const labelHeight = 30;
	const frameHeight = 180;
	const rowHeight = labelHeight + frameHeight;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = headingHeight + rowHeight * strips.length;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas contact sheet tidak tersedia.");

	context.fillStyle = "#111827";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "#f9fafb";
	context.font = "600 16px sans-serif";
	context.fillText("10% / opening", 12, 24);
	context.fillText("50% / middle", 332, 24);
	context.fillText("90% / ending", 652, 24);

	for (const [index, bitmap] of bitmaps.entries()) {
		const top = headingHeight + index * rowHeight;
		context.fillStyle = "#1f2937";
		context.fillRect(0, top, width, labelHeight);
		context.fillStyle = "#f9fafb";
		context.font = "500 14px sans-serif";
		context.fillText(
			`Row ${index + 1} · ${strips[index]?.name ?? "video"}`,
			10,
			top + 20,
		);
		context.drawImage(bitmap, 0, top + labelHeight, width, frameHeight);
	}
	bitmaps.forEach((bitmap) => bitmap.close());

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(new Error("Gagal membuat contact sheet.")),
			"image/jpeg",
			0.88,
		);
	});
}
