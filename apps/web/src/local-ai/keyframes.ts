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
	const response = await fetch("/api/local-ai/keyframes", {
		method: "POST",
		headers: {
			"content-type": file.type || "application/octet-stream",
			"x-opencut-local-ai": "1",
		},
		body: file,
	});
	if (!response.ok) {
		const payload: unknown = await response.json();
		throw new Error(readErrorMessage(payload) ?? "Ekstraksi keyframe gagal");
	}
	return response.blob();
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

function readErrorMessage(value: unknown): string | undefined {
	return typeof value === "object" &&
		value !== null &&
		"error" in value &&
		typeof value.error === "string"
		? value.error
		: undefined;
}
