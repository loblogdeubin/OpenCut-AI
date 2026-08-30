import { MediaChecksumV1 } from "opencut-wasm";

const CHECKSUM_CHUNK_BYTES = 4 * 1024 * 1024;

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
	const checksum = new MediaChecksumV1();
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
