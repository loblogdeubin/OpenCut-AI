import type { TranslationProgress } from "@/translation/types";
import type { WorkerMessage, WorkerResponse } from "@/translation/worker";

type ProgressCallback = (progress: TranslationProgress) => void;

class TranslationService {
	private worker: Worker | null = null;
	private initialization: Promise<void> | null = null;

	async translateEnglishToIndonesian({
		texts,
		onProgress,
	}: {
		texts: string[];
		onProgress?: ProgressCallback;
	}): Promise<string[]> {
		if (texts.length === 0) return [];
		await this.ensureWorker({ onProgress });

		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Worker terjemahan tidak tersedia"));
				return;
			}

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;
				if (response.type === "translate-progress") {
					onProgress?.({
						status: "translating",
						progress: response.progress,
						message: `Menerjemahkan ${response.progress}%`,
					});
					return;
				}
				if (response.type === "translate-complete") {
					this.worker?.removeEventListener("message", handleMessage);
					resolve(response.translations);
					return;
				}
				if (response.type === "translate-error") {
					this.worker?.removeEventListener("message", handleMessage);
					reject(new Error(response.error));
				}
			};

			this.worker.addEventListener("message", handleMessage);
			this.worker.postMessage({
				type: "translate",
				texts,
			} satisfies WorkerMessage);
		});
	}

	private ensureWorker({
		onProgress,
	}: {
		onProgress?: ProgressCallback;
	}): Promise<void> {
		if (this.initialization) return this.initialization;

		this.worker = new Worker(
			new URL("../../translation/worker.ts", import.meta.url),
			{
				type: "module",
			},
		);
		this.initialization = new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Worker terjemahan gagal dibuat"));
				return;
			}

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;
				if (response.type === "init-progress") {
					onProgress?.({
						status: "loading-model",
						progress: response.progress,
						message: `Mengunduh model terjemahan ${response.progress}%`,
					});
					return;
				}
				if (response.type === "init-complete") {
					this.worker?.removeEventListener("message", handleMessage);
					resolve();
					return;
				}
				if (response.type === "init-error") {
					this.worker?.removeEventListener("message", handleMessage);
					this.terminate();
					reject(new Error(response.error));
				}
			};

			this.worker.addEventListener("message", handleMessage);
			this.worker.postMessage({ type: "init" } satisfies WorkerMessage);
		});
		return this.initialization;
	}

	terminate() {
		this.worker?.terminate();
		this.worker = null;
		this.initialization = null;
	}
}

export const translationService = new TranslationService();
