export interface LocalAiPreflight {
	ffmpeg: { available: boolean; version?: string };
	ffprobe: { available: boolean; version?: string };
	transcription: {
		available: boolean;
		engine?: string;
		model?: string;
	};
}

export interface LocalDubbingVoice {
	id: string;
	label: string;
}

export type LocalDubbingProvider = "windows-sapi" | "piper";

export interface LocalDubbingProviderPreflight {
	id: LocalDubbingProvider;
	available: boolean;
	version?: string;
	voices: LocalDubbingVoice[];
	defaultVoice?: string;
	reason?: "binary_missing" | "model_missing";
}

export interface LocalDubbingPreflight {
	available: boolean;
	defaultProvider?: LocalDubbingProvider;
	providers: LocalDubbingProviderPreflight[];
}

export interface LocalDubbingSynthesisRequest {
	text: string;
	provider?: LocalDubbingProvider;
	voice?: string;
}

export interface LocalDubbingSynthesisResult {
	audio: Blob;
	provider: LocalDubbingProvider;
	voice: string;
}
