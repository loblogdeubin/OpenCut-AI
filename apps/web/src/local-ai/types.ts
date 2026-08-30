export interface LocalAiPreflight {
	ffmpeg: { available: boolean; version?: string };
	ffprobe: { available: boolean; version?: string };
	transcription: {
		available: boolean;
		engine?: string;
		model?: string;
	};
}
