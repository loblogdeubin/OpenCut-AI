const CHECKSUM_CHUNK_BYTES = 4 * 1024 * 1024;

interface StreamingChecksum {
	update(bytes: Uint8Array): void;
	finish(): string;
	free(): void;
}

type WasmChecksumModule = {
	MediaChecksumV1?: new () => StreamingChecksum;
};

async function createWasmChecksum(): Promise<StreamingChecksum | null> {
	const wasm = (await import("opencut-wasm")) as WasmChecksumModule;
	return wasm.MediaChecksumV1 ? new wasm.MediaChecksumV1() : null;
}

function toHex({ bytes }: { bytes: ArrayBuffer }): string {
	return Array.from(new Uint8Array(bytes), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function computeFallbackChecksum({
	file,
	onProgress,
}: {
	file: Blob;
	onProgress?: ({
		processedBytes,
		totalBytes,
	}: {
		processedBytes: number;
		totalBytes: number;
	}) => void;
}): Promise<string> {
	const bytes = await file.arrayBuffer();
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	onProgress?.({ processedBytes: file.size, totalBytes: file.size });
	return `sha256:${toHex({ bytes: digest })}`;
}

export async function computeMediaChecksum({
	file,
	onProgress,
}: {
	file: Blob;
	onProgress?: ({
		processedBytes,
		totalBytes,
	}: {
		processedBytes: number;
		totalBytes: number;
	}) => void;
}): Promise<string> {
	const checksum = await createWasmChecksum();
	if (!checksum) {
		return computeFallbackChecksum({ file, onProgress });
	}

	let offset = 0;

	try {
		while (offset < file.size) {
			const end = Math.min(file.size, offset + CHECKSUM_CHUNK_BYTES);
			const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
			checksum.update(bytes);
			offset = end;
			onProgress?.({ processedBytes: offset, totalBytes: file.size });
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		return checksum.finish();
	} finally {
		checksum.free();
	}
}
