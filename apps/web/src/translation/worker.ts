import { pipeline } from "@huggingface/transformers";

const TRANSLATION_MODEL = "Xenova/opus-mt-en-id";

export type WorkerMessage =
	| { type: "init" }
	| { type: "translate"; texts: string[] };

export type WorkerResponse =
	| { type: "init-progress"; progress: number }
	| { type: "init-complete" }
	| { type: "init-error"; error: string }
	| { type: "translate-progress"; progress: number }
	| { type: "translate-complete"; translations: string[] }
	| { type: "translate-error"; error: string };

let translator: Awaited<ReturnType<typeof createTranslator>> | null = null;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;
	if (message.type === "init") {
		await handleInit();
		return;
	}
	await handleTranslate({ texts: message.texts });
};

function createTranslator() {
	return pipeline("translation", TRANSLATION_MODEL, {
		dtype: "q4",
		device: "auto",
		progress_callback: handleModelProgress,
	});
}

function handleModelProgress(progressInfo: {
	status?: string;
	file?: string;
	loaded?: number;
	total?: number;
}) {
	const file = progressInfo.file;
	if (!file) return;
	const loaded = progressInfo.loaded ?? 0;
	const total = progressInfo.total ?? 0;

	if (progressInfo.status === "progress" && total > 0) {
		fileBytes.set(file, { loaded, total });
	} else if (progressInfo.status === "done") {
		const existing = fileBytes.get(file);
		if (existing) {
			fileBytes.set(file, { loaded: existing.total, total: existing.total });
		}
	}

	let totalLoaded = 0;
	let totalSize = 0;
	for (const current of fileBytes.values()) {
		totalLoaded += current.loaded;
		totalSize += current.total;
	}
	if (totalSize === 0) return;

	const roundedProgress = Math.floor((totalLoaded / totalSize) * 100);
	if (roundedProgress === lastReportedProgress) return;
	lastReportedProgress = roundedProgress;
	self.postMessage({
		type: "init-progress",
		progress: roundedProgress,
	} satisfies WorkerResponse);
}

async function handleInit() {
	lastReportedProgress = -1;
	fileBytes.clear();
	try {
		translator = await createTranslator();
		self.postMessage({ type: "init-complete" } satisfies WorkerResponse);
	} catch (error) {
		self.postMessage({
			type: "init-error",
			error:
				error instanceof Error
					? error.message
					: "Model terjemahan gagal dimuat",
		} satisfies WorkerResponse);
	}
}

async function handleTranslate({ texts }: { texts: string[] }) {
	if (!translator) {
		self.postMessage({
			type: "translate-error",
			error: "Model terjemahan belum siap",
		} satisfies WorkerResponse);
		return;
	}

	try {
		const translations: string[] = [];
		for (const [index, text] of texts.entries()) {
			const output = await translator(text);
			const firstOutput = output[0];
			const translatedText = (
				Array.isArray(firstOutput) ? firstOutput[0] : firstOutput
			)?.translation_text?.trim();
			if (!translatedText) {
				throw new Error(`Terjemahan segmen ${index + 1} kosong`);
			}
			translations.push(translatedText);
			self.postMessage({
				type: "translate-progress",
				progress: Math.round(((index + 1) / texts.length) * 100),
			} satisfies WorkerResponse);
		}

		self.postMessage({
			type: "translate-complete",
			translations,
		} satisfies WorkerResponse);
	} catch (error) {
		self.postMessage({
			type: "translate-error",
			error: error instanceof Error ? error.message : "Terjemahan lokal gagal",
		} satisfies WorkerResponse);
	}
}
