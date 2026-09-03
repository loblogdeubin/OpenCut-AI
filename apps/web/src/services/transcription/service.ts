import type {
	TranscriptionLanguage,
	TranscriptionResult,
	TranscriptionProgress,
	TranscriptionModelId,
} from "@/transcription/types";
import {
	DEFAULT_TRANSCRIPTION_MODEL,
	TRANSCRIPTION_MODELS,
} from "@/transcription/models";
import type { WorkerMessage, WorkerResponse } from "./worker";

type ProgressCallback = (progress: TranscriptionProgress) => void;

const WORKER_IDLE_TIMEOUT_MS = 15_000;

class TranscriptionService {
	private worker: Worker | null = null;
	private currentModelId: TranscriptionModelId | null = null;
	private isInitialized = false;
	private isInitializing = false;
	private activeRequests = 0;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;

	async transcribe({
		audioData,
		language = "auto",
		modelId = DEFAULT_TRANSCRIPTION_MODEL,
		onProgress,
	}: {
		audioData: Float32Array;
		language?: TranscriptionLanguage;
		modelId?: TranscriptionModelId;
		onProgress?: ProgressCallback;
	}): Promise<TranscriptionResult> {
		this.activeRequests += 1;
		this.clearIdleTermination();

		try {
			await this.ensureWorker({ modelId, onProgress });

			return await new Promise((resolve, reject) => {
				if (!this.worker) {
					reject(new Error("Worker not initialized"));
					return;
				}

				const handleMessage = (event: MessageEvent<WorkerResponse>) => {
					const response = event.data;

					switch (response.type) {
						case "transcribe-progress":
							onProgress?.({
								status: "transcribing",
								progress: response.progress,
								message: "Transcribing audio...",
							});
							break;

						case "transcribe-complete":
							this.worker?.removeEventListener("message", handleMessage);
							resolve({
								text: response.text,
								segments: response.segments,
								language,
							});
							break;

						case "transcribe-error":
							this.worker?.removeEventListener("message", handleMessage);
							reject(new Error(response.error));
							break;

						case "cancelled":
							this.worker?.removeEventListener("message", handleMessage);
							reject(new Error("Transcription cancelled"));
							break;
					}
				};

				this.worker.addEventListener("message", handleMessage);

				const message = {
					type: "transcribe",
					audio: audioData,
					language,
				} satisfies WorkerMessage;
				if (audioData.buffer instanceof ArrayBuffer) {
					this.worker.postMessage(message, [audioData.buffer]);
				} else {
					this.worker.postMessage(message);
				}
			});
		} finally {
			this.activeRequests -= 1;
			this.scheduleIdleTermination();
		}
	}

	cancel() {
		this.worker?.postMessage({ type: "cancel" } satisfies WorkerMessage);
	}

	private async ensureWorker({
		modelId,
		onProgress,
	}: {
		modelId: TranscriptionModelId;
		onProgress?: ProgressCallback;
	}): Promise<void> {
		const needsNewModel = this.currentModelId !== modelId;

		if (this.worker && this.isInitialized && !needsNewModel) {
			return;
		}

		if (this.isInitializing && !needsNewModel) {
			await this.waitForInit();
			return;
		}

		this.terminate();
		this.isInitializing = true;
		this.isInitialized = false;

		const model = TRANSCRIPTION_MODELS.find((m) => m.id === modelId);
		if (!model) {
			throw new Error(`Unknown model: ${modelId}`);
		}

		this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});

		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Failed to create worker"));
				return;
			}

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;

				switch (response.type) {
					case "init-progress":
						onProgress?.({
							status: "loading-model",
							progress: response.progress,
							message: `Loading ${model.name} model...`,
						});
						break;

					case "init-complete":
						this.worker?.removeEventListener("message", handleMessage);
						this.isInitialized = true;
						this.isInitializing = false;
						this.currentModelId = modelId;
						resolve();
						break;

					case "init-error":
						this.worker?.removeEventListener("message", handleMessage);
						this.isInitializing = false;
						this.terminate();
						reject(new Error(response.error));
						break;
				}
			};

			this.worker.addEventListener("message", handleMessage);

			this.worker.postMessage({
				type: "init",
				modelId: model.huggingFaceId,
			} satisfies WorkerMessage);
		});
	}

	private waitForInit(): Promise<void> {
		return new Promise((resolve) => {
			const checkInit = () => {
				if (this.isInitialized) {
					resolve();
				} else if (!this.isInitializing) {
					resolve();
				} else {
					setTimeout(checkInit, 100);
				}
			};
			checkInit();
		});
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

	terminate() {
		this.clearIdleTermination();
		this.worker?.terminate();
		this.worker = null;
		this.isInitialized = false;
		this.isInitializing = false;
		this.currentModelId = null;
	}
}

export const transcriptionService = new TranscriptionService();
