let removerPromise: Promise<(input: string) => Promise<unknown[]>> | null =
	null;

async function getRemover() {
	removerPromise ??= import("@huggingface/transformers").then(
		async ({ pipeline, env }) => {
			env.allowLocalModels = false;
			return (await pipeline("background-removal" as never, "briaai/RMBG-1.4", {
				device: "wasm",
			})) as unknown as (input: string) => Promise<unknown[]>;
		},
	);
	return removerPromise;
}

export async function removeCanvasBackgroundLocally({
	canvas,
	signal,
}: {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	signal?: AbortSignal;
}): Promise<HTMLCanvasElement> {
	if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
	const remover = await getRemover();
	const input = document.createElement("canvas");
	input.width = canvas.width;
	input.height = canvas.height;
	input.getContext("2d")?.drawImage(canvas, 0, 0);
	const output = (await remover(input.toDataURL("image/jpeg", 0.9)))[0] as
		| { toCanvas?: () => HTMLCanvasElement }
		| undefined;
	if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
	const result = output?.toCanvas?.();
	if (!result)
		throw new Error("The background-removal model returned no frame.");
	return result;
}

export async function removeImageBackgroundLocally({
	file,
	signal,
	onProgress,
}: {
	file: File;
	signal: AbortSignal;
	onProgress: (progress: number) => void;
}): Promise<File> {
	if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
	onProgress(0.05);
	const remover = await getRemover();
	onProgress(0.35);
	const sourceUrl = URL.createObjectURL(file);
	try {
		const output = (await remover(sourceUrl))[0] as
			| { toCanvas?: () => HTMLCanvasElement }
			| undefined;
		if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
		const canvas = output?.toCanvas?.();
		if (!canvas)
			throw new Error("The local background-removal model returned no image.");
		onProgress(0.9);
		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(value) =>
					value
						? resolve(value)
						: reject(new Error("Could not encode transparent PNG.")),
				"image/png",
			),
		);
		onProgress(1);
		return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-no-bg.png`, {
			type: "image/png",
		});
	} finally {
		URL.revokeObjectURL(sourceUrl);
	}
}

