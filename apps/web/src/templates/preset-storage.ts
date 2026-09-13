export type StoredTemplatePreset = {
	id: string;
	name: string;
	file: File;
	createdAt: string;
};

const DB_NAME = "opencut-template-presets";
const STORE_NAME = "presets";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(STORE_NAME)) {
				database.createObjectStore(STORE_NAME, { keyPath: "id" });
			}
		};
	});
}

export async function loadTemplatePresets(): Promise<StoredTemplatePreset[]> {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const request = database
			.transaction(STORE_NAME, "readonly")
			.objectStore(STORE_NAME)
			.getAll();
		request.onerror = () => reject(request.error);
		request.onsuccess = () =>
			resolve(
				(request.result as StoredTemplatePreset[]).sort((a, b) =>
					b.createdAt.localeCompare(a.createdAt),
				),
			);
	});
}

export async function saveTemplatePreset({
	file,
}: {
	file: File;
}): Promise<StoredTemplatePreset> {
	const preset: StoredTemplatePreset = {
		id: crypto.randomUUID(),
		name: file.name.replace(/\.[^.]+$/, ""),
		file,
		createdAt: new Date().toISOString(),
	};
	const database = await openDatabase();
	await new Promise<void>((resolve, reject) => {
		const request = database
			.transaction(STORE_NAME, "readwrite")
			.objectStore(STORE_NAME)
			.put(preset);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
	return preset;
}

export async function deleteTemplatePreset({
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
