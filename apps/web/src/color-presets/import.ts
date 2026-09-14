export type ToneCurvePoint = { input: number; output: number };

export type ColorPresetParams = {
	exposure: number;
	contrast: number;
	highlights: number;
	shadows: number;
	temperature: number;
	tint: number;
	saturation: number;
	vibrance: number;
	whites?: number;
	blacks?: number;
	toneCurve?: ToneCurvePoint[];
};

export type ColorPreset = {
	id: string;
	name: string;
	category: string;
	source: "built-in" | "imported";
	params: ColorPresetParams;
};

type StoredColorPreset = ColorPreset & { createdAt: string };

const DB_NAME = "opencut-color-presets";
const STORE_NAME = "presets";
const DB_VERSION = 1;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_XMP_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 512;

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE_NAME)) {
				request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
			}
		};
	});
}

export async function loadCustomColorPresets(): Promise<ColorPreset[]> {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const request = database
			.transaction(STORE_NAME, "readonly")
			.objectStore(STORE_NAME)
			.getAll();
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const presets = (request.result as unknown[])
				.filter(isStoredColorPreset)
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
			resolve(presets);
		};
	});
}

export async function deleteCustomColorPreset({
	id,
}: {
	id: string;
}): Promise<void> {
	const database = await openDatabase();
	await new Promise<void>((resolve, reject) => {
		const request = database
			.transaction(STORE_NAME, "readwrite")
			.objectStore(STORE_NAME)
			.delete(id);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}

export async function importColorPresetFiles({
	files,
}: {
	files: File[];
}): Promise<ColorPreset[]> {
	if (files.length === 0) return [];
	if (files.length > MAX_ARCHIVE_ENTRIES) {
		throw new Error(`Pilih maksimal ${MAX_ARCHIVE_ENTRIES} file sekaligus.`);
	}

	const candidates: Array<{ name: string; bytes: Uint8Array }> = [];
	let totalCandidateBytes = 0;
	for (const file of files) {
		const lowerName = file.name.toLowerCase();
		if (lowerName.endsWith(".zip")) {
			if (file.size > MAX_ARCHIVE_BYTES) {
				throw new Error(`ZIP ${file.name} melebihi batas 64 MB.`);
			}
			const extracted = await extractXmpEntriesFromZip({
				archive: new Uint8Array(await file.arrayBuffer()),
			});
			candidates.push(...extracted);
			totalCandidateBytes += extracted.reduce(
				(total, entry) => total + entry.bytes.byteLength,
				0,
			);
		} else if (lowerName.endsWith(".xmp")) {
			if (file.size > MAX_XMP_BYTES) {
				throw new Error(`Preset ${file.name} melebihi batas 2 MB.`);
			}
			candidates.push({
				name: safeEntryName(file.name),
				bytes: new Uint8Array(await file.arrayBuffer()),
			});
			totalCandidateBytes += file.size;
		}
		if (candidates.length > MAX_ARCHIVE_ENTRIES) {
			throw new Error(
				`Impor dibatasi ${MAX_ARCHIVE_ENTRIES} preset per proses.`,
			);
		}
		if (totalCandidateBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
			throw new Error("Total preset hasil ekstraksi melebihi batas 32 MB.");
		}
	}
	if (candidates.length === 0) {
		throw new Error("Tidak ditemukan preset Lightroom .xmp yang valid.");
	}

	const decoder = new TextDecoder("utf-8", { fatal: true });
	const imported: StoredColorPreset[] = [];
	const failures: string[] = [];
	for (const candidate of candidates) {
		try {
			const xmp = decoder.decode(candidate.bytes);
			const parsed = await parseXmp({ sourceName: candidate.name, xmp });
			imported.push({
				id: `imported-${await contentId(candidate.bytes)}`,
				name: cleanPresetName({
					name: parsed.name,
					sourceName: candidate.name,
				}),
				category: "Imported",
				source: "imported",
				params: normalizeParams(parsed.params),
				createdAt: new Date().toISOString(),
			});
		} catch {
			failures.push(candidate.name);
		}
	}
	if (imported.length === 0) {
		throw new Error(
			`Preset tidak dapat dibaca${failures.length ? `: ${failures.slice(0, 3).join(", ")}` : "."}`,
		);
	}

	const database = await openDatabase();
	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, "readwrite");
		const store = transaction.objectStore(STORE_NAME);
		for (const preset of imported) store.put(preset);
		transaction.onerror = () => reject(transaction.error);
		transaction.oncomplete = () => resolve();
	});
	return imported;
}

async function parseXmp({
	sourceName,
	xmp,
}: {
	sourceName: string;
	xmp: string;
}): Promise<{ name: string; params: ColorPresetParams }> {
	if (new TextEncoder().encode(xmp).byteLength > MAX_XMP_BYTES) {
		throw new Error("XMP terlalu besar");
	}
	if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xmp)) {
		throw new Error("DTD dan entity tidak diizinkan di preset XMP");
	}
	const wasm = await import("opencut-wasm");
	if (typeof wasm.parseLightroomXmp === "function") {
		return wasm.parseLightroomXmp(sourceName, xmp);
	}
	return parseXmpFallback({ sourceName, xmp });
}

function parseXmpFallback({
	sourceName,
	xmp,
}: {
	sourceName: string;
	xmp: string;
}): { name: string; params: ColorPresetParams } {
	const attributes = new Map<string, string>();
	for (const match of xmp.matchAll(
		/(?:\b|:)([A-Za-z][\w-]*)\s*=\s*(["'])([\s\S]*?)\2/g,
	)) {
		attributes.set(match[1], decodeXml(match[3]));
	}
	// Local numeric reader mirrors Camera Raw's bounded controls.
	// eslint-disable-next-line opencut/prefer-object-params
	const read = (names: string[], min: number, max: number) => {
		for (const name of names) {
			const raw = attributes.get(name);
			if (raw === undefined) continue;
			const value = Number(raw);
			if (Number.isFinite(value)) return clamp(value, min, max);
		}
		return 0;
	};
	const compatibleKeys = [
		"Exposure2012",
		"Exposure",
		"Contrast2012",
		"Contrast",
		"Highlights2012",
		"Highlights",
		"Shadows2012",
		"Shadows",
		"Whites2012",
		"Whites",
		"Blacks2012",
		"Blacks",
		"Temperature",
		"IncrementalTemperature",
		"Tint",
		"IncrementalTint",
		"Saturation",
		"Vibrance",
		"ToneCurvePV2012",
		"ToneCurve",
	];
	if (!compatibleKeys.some((key) => xmp.includes(key))) {
		throw new Error("XMP tidak berisi parameter Lightroom yang kompatibel");
	}
	const kelvin = read(["Temperature"], 2_000, 50_000);
	const toneCurve: ToneCurvePoint[] = [];
	const curveSection = xmp.match(
		/<(?:\w+:)?ToneCurve(?:PV2012)?\b[^>]*>([\s\S]*?)<\/(?:\w+:)?ToneCurve(?:PV2012)?>/i,
	)?.[1];
	if (curveSection) {
		for (const match of curveSection.matchAll(
			/<(?:\w+:)?li\b[^>]*>\s*([\d.]+)\s*,\s*([\d.]+)\s*<\/[^>]+>/gi,
		)) {
			if (toneCurve.length >= 256) break;
			toneCurve.push({
				input: clamp(Number(match[1]), 0, 255),
				output: clamp(Number(match[2]), 0, 255),
			});
		}
	}
	return {
		name:
			attributes.get("PresetName") ??
			extractNestedName(xmp) ??
			sourceName.replace(/\.xmp$/i, ""),
		params: {
			exposure: read(["Exposure2012", "Exposure"], -5, 5),
			contrast: read(["Contrast2012", "Contrast"], -100, 100),
			highlights: read(["Highlights2012", "Highlights"], -100, 100),
			shadows: read(["Shadows2012", "Shadows"], -100, 100),
			whites: read(["Whites2012", "Whites"], -100, 100),
			blacks: read(["Blacks2012", "Blacks"], -100, 100),
			temperature: attributes.has("IncrementalTemperature")
				? read(["IncrementalTemperature"], -100, 100)
				: kelvin
					? clamp((kelvin - 6_500) / 45, -100, 100)
					: 0,
			tint: read(["IncrementalTint", "Tint"], -150, 150),
			saturation: read(["Saturation"], -100, 100),
			vibrance: read(["Vibrance"], -100, 100),
			toneCurve,
		},
	};
}

async function extractXmpEntriesFromZip({
	archive,
}: {
	archive: Uint8Array;
}): Promise<Array<{ name: string; bytes: Uint8Array }>> {
	const view = new DataView(
		archive.buffer,
		archive.byteOffset,
		archive.byteLength,
	);
	const eocd = findEndOfCentralDirectory(view);
	const entryCount = view.getUint16(eocd + 10, true);
	const centralOffset = view.getUint32(eocd + 16, true);
	if (entryCount > MAX_ARCHIVE_ENTRIES)
		throw new Error("ZIP berisi terlalu banyak file.");
	if (centralOffset >= archive.byteLength)
		throw new Error("Struktur ZIP tidak valid.");

	const decoder = new TextDecoder();
	const output: Array<{ name: string; bytes: Uint8Array }> = [];
	let totalBytes = 0;
	let cursor = centralOffset;
	for (let index = 0; index < entryCount; index += 1) {
		if (
			cursor + 46 > archive.byteLength ||
			view.getUint32(cursor, true) !== 0x02014b50
		) {
			throw new Error("Central directory ZIP rusak.");
		}
		const flags = view.getUint16(cursor + 8, true);
		const method = view.getUint16(cursor + 10, true);
		const compressedSize = view.getUint32(cursor + 20, true);
		const uncompressedSize = view.getUint32(cursor + 24, true);
		const nameLength = view.getUint16(cursor + 28, true);
		const extraLength = view.getUint16(cursor + 30, true);
		const commentLength = view.getUint16(cursor + 32, true);
		const localOffset = view.getUint32(cursor + 42, true);
		const next = cursor + 46 + nameLength + extraLength + commentLength;
		if (next > archive.byteLength) throw new Error("Nama entry ZIP terpotong.");
		const name = decoder.decode(
			archive.subarray(cursor + 46, cursor + 46 + nameLength),
		);
		cursor = next;
		validateEntryPath(name);
		if (name.endsWith("/") || !name.toLowerCase().endsWith(".xmp")) continue;
		if ((flags & 1) !== 0) throw new Error("ZIP terenkripsi tidak didukung.");
		if (method !== 0 && method !== 8)
			throw new Error(`Metode kompresi ZIP ${method} tidak didukung.`);
		if (
			uncompressedSize > MAX_XMP_BYTES ||
			compressedSize === 0xffffffff ||
			uncompressedSize === 0xffffffff
		) {
			throw new Error(`Entry ${name} terlalu besar atau menggunakan ZIP64.`);
		}
		totalBytes += uncompressedSize;
		if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES)
			throw new Error("Isi ZIP melebihi batas 32 MB.");
		if (compressedSize > 0 && uncompressedSize / compressedSize > 200)
			throw new Error("Rasio kompresi ZIP tidak aman.");
		if (
			localOffset + 30 > archive.byteLength ||
			view.getUint32(localOffset, true) !== 0x04034b50
		) {
			throw new Error("Local header ZIP rusak.");
		}
		const localNameLength = view.getUint16(localOffset + 26, true);
		const localExtraLength = view.getUint16(localOffset + 28, true);
		const dataStart = localOffset + 30 + localNameLength + localExtraLength;
		const dataEnd = dataStart + compressedSize;
		if (dataEnd > archive.byteLength)
			throw new Error("Data entry ZIP terpotong.");
		const compressed = archive.slice(dataStart, dataEnd);
		const bytes = method === 0 ? compressed : await inflateRaw(compressed);
		if (
			bytes.byteLength !== uncompressedSize ||
			bytes.byteLength > MAX_XMP_BYTES
		) {
			throw new Error(`Ukuran hasil ekstraksi ${name} tidak cocok.`);
		}
		output.push({ name: safeEntryName(name), bytes });
	}
	return output;
}

function findEndOfCentralDirectory(view: DataView): number {
	const minimum = Math.max(0, view.byteLength - 65_557);
	for (let cursor = view.byteLength - 22; cursor >= minimum; cursor -= 1) {
		if (view.getUint32(cursor, true) === 0x06054b50) return cursor;
	}
	throw new Error("File bukan ZIP yang valid.");
}

function validateEntryPath(name: string): void {
	const normalized = name.replace(/\\/g, "/");
	if (
		normalized.startsWith("/") ||
		/^[A-Za-z]:\//.test(normalized) ||
		normalized.split("/").some((part) => part === ".." || part.includes("\0"))
	) {
		throw new Error("ZIP mengandung path yang tidak aman.");
	}
}

function safeEntryName(name: string): string {
	validateEntryPath(name);
	return (name.replace(/\\/g, "/").split("/").pop() ?? "preset.xmp")
		.split("")
		.filter((character) => {
			const code = character.charCodeAt(0);
			return code > 31 && code !== 127;
		})
		.join("")
		.slice(0, 180);
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
	if (typeof DecompressionStream === "undefined")
		throw new Error("Browser tidak mendukung ekstraksi ZIP.");
	const stream = new Blob([Uint8Array.from(bytes).buffer])
		.stream()
		.pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
	const output = new Uint8Array(await new Response(stream).arrayBuffer());
	if (output.byteLength > MAX_XMP_BYTES)
		throw new Error("Hasil ekstraksi terlalu besar.");
	return output;
}

async function contentId(bytes: Uint8Array): Promise<string> {
	if (globalThis.crypto?.subtle) {
		const digest = await crypto.subtle.digest(
			"SHA-256",
			Uint8Array.from(bytes).buffer,
		);
		return [...new Uint8Array(digest)]
			.slice(0, 12)
			.map((value) => value.toString(16).padStart(2, "0"))
			.join("");
	}
	let hash = 2166136261;
	for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeParams(params: ColorPresetParams): ColorPresetParams {
	return {
		exposure: clamp(params.exposure, -5, 5),
		contrast: clamp(params.contrast, -100, 100),
		highlights: clamp(params.highlights, -100, 100),
		shadows: clamp(params.shadows, -100, 100),
		whites: clamp(params.whites ?? 0, -100, 100),
		blacks: clamp(params.blacks ?? 0, -100, 100),
		temperature: clamp(params.temperature, -100, 100),
		tint: clamp(params.tint, -150, 150),
		saturation: clamp(params.saturation, -100, 100),
		vibrance: clamp(params.vibrance, -100, 100),
		toneCurve: (params.toneCurve ?? []).slice(0, 256).map((point) => ({
			input: clamp(point.input, 0, 255),
			output: clamp(point.output, 0, 255),
		})),
	};
}

function isStoredColorPreset(value: unknown): value is StoredColorPreset {
	if (!value || typeof value !== "object") return false;
	const preset = value as Partial<StoredColorPreset>;
	return (
		preset.source === "imported" &&
		typeof preset.id === "string" &&
		typeof preset.name === "string" &&
		typeof preset.createdAt === "string" &&
		!!preset.params
	);
}

function cleanPresetName({
	name,
	sourceName,
}: {
	name: string;
	sourceName: string;
}): string {
	const cleaned = name
		.split("")
		.filter((character) => {
			const code = character.charCodeAt(0);
			return code > 31 && code !== 127;
		})
		.join("")
		.trim()
		.slice(0, 160);
	return (
		cleaned ||
		sourceName.replace(/\.xmp$/i, "").slice(0, 160) ||
		"Imported preset"
	);
}

function decodeXml(value: string): string {
	return value.replace(
		/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,
		(entity) => {
			const named: Record<string, string> = {
				"&amp;": "&",
				"&lt;": "<",
				"&gt;": ">",
				"&quot;": '"',
				"&apos;": "'",
			};
			if (named[entity]) return named[entity];
			const hex = entity.toLowerCase().startsWith("&#x");
			const code = Number.parseInt(
				entity.slice(hex ? 3 : 2, -1),
				hex ? 16 : 10,
			);
			return Number.isFinite(code) ? String.fromCodePoint(code) : "";
		},
	);
}

function extractNestedName(xmp: string): string | undefined {
	const section = xmp.match(
		/<(?:\w+:)?Name\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Name>/i,
	)?.[1];
	const value = section?.match(/<(?:\w+:)?li\b[^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1];
	return value ? decodeXml(value.replace(/<[^>]+>/g, "")).trim() : undefined;
}

// eslint-disable-next-line opencut/prefer-object-params
function clamp(value: number, min: number, max: number): number {
	return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
}
