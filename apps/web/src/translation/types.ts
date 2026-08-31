export interface TranslationProgress {
	status: "loading-model" | "translating";
	progress: number;
	message: string;
}
