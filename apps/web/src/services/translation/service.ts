import type { TranslationProgress } from "@/translation/types";
import type { WorkerMessage, WorkerResponse } from "@/translation/worker";

type ProgressCallback = (progress: TranslationProgress) => void;

const WORKER_IDLE_TIMEOUT_MS = 15_000;

class TranslationService {
	private worker: Worker | null = null;
	private initialization: Promise<void> | null = null;
	private activeRequests = 0;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;

	async translateEnglishToIndonesian({
		texts,
		onProgress,
	}: {
		texts: string[];
		onProgress?: ProgressCallback;
	}): Promise<string[]> {
		if (texts.length === 0) return [];
		this.activeRequests += 1;
		this.clearIdleTermination();

		try {
			await this.ensureWorker({ onProgress });

			return await new Promise((resolve, reject) => {
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
		} finally {
			this.activeRequests -= 1;
			this.scheduleIdleTermination();
		}
	}

	private clearIdleTermination(): void {
		if (!this.idleTimer) return;
		clearTimeout(this.idleTimer);
		this.idleTimer = null;
	}

	private scheduleIdleTermination(): void {
		if (this.activeRequests > 0 || !this.worker) return;
		this.clearIdleTermination();
		this.idleTimer = setTimeout(() => {
			this.terminate();
		}, WORKER_IDLE_TIMEOUT_MS);
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
		this.clearIdleTermination();
		this.worker?.terminate();
		this.worker = null;
		this.initialization = null;
	}
}

export const translationService = new TranslationService();
