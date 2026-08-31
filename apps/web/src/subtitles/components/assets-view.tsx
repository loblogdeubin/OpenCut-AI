import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { extractTimelineAudio } from "@/media/mediabunny";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	CaptionChunk,
	TranscriptionLanguage,
	TranscriptionProgress,
	TranscriptionResult,
} from "@/transcription/types";
import { transcriptionService } from "@/services/transcription/service";
import { decodeAudioToFloat32 } from "@/media/audio";
import { buildCaptionChunks } from "@/transcription/caption";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { parseSubtitleFile } from "@/subtitles/parse";
import { serializeSrt } from "@/subtitles/srt";
import type { SubtitleCue } from "@/subtitles/types";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import {
	AlertCircleIcon,
	CloudUploadIcon,
	Download01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DiagnosticSeverity } from "@/diagnostics/types";
import { transcribeMediaLocally } from "@/local-ai/transcribe";
import { downloadBlob } from "@/utils/browser";
import { mediaTimeToSeconds } from "@/wasm";
import { toast } from "sonner";
import type { SceneTracks } from "@/timeline";
import { translationService } from "@/services/translation/service";
import { applySegmentTranslations } from "@/translation/segments";
import type { TranslationProgress } from "@/translation/types";

const DIAGNOSTIC_BUTTON_VARIANT: Record<
	DiagnosticSeverity,
	"caution" | "destructive-foreground"
> = {
	caution: "caution",
	error: "destructive-foreground",
};

type ProcessingState =
	| { status: "idle"; error: string | null; warnings: string[] }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
};

/* eslint-disable opencut/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return { status: "idle", error: null, warnings: action.warnings };
		case "fail":
			return { status: "idle", error: action.error, warnings: [] };
	}
}
/* eslint-enable opencut/prefer-object-params */

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [translateToIndonesian, setTranslateToIndonesian] = useState(false);
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();
	const [localTranscriptionAvailable, setLocalTranscriptionAvailable] =
		useState<boolean | null>(null);
	const activeSceneTracks = useEditor(
		(current) => current.scenes.getActiveSceneOrNull()?.tracks ?? null,
	);
	const exportableCaptions = useMemo(
		() => collectTimelineCaptions({ tracks: activeSceneTracks }),
		[activeSceneTracks],
	);

	const isProcessing = processing.status === "processing";

	const activeDiagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);

	useEffect(() => {
		const controller = new AbortController();
		void fetch("/api/local-ai/preflight", { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) return;
				const result: unknown = await response.json();
				setLocalTranscriptionAvailable(
					hasLocalTranscription({ value: result }),
				);
			})
			.catch(() => undefined);
		return () => controller.abort();
	}, []);

	const handleProgress = (progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			dispatch({
				type: "update_step",
				step: `Loading model ${Math.round(progress.progress)}%`,
			});
		} else if (progress.status === "transcribing") {
			dispatch({ type: "update_step", step: "Transcribing..." });
		}
	};

	const handleTranslationProgress = (progress: TranslationProgress) => {
		dispatch({ type: "update_step", step: progress.message });
	};

	const insertCaptions = ({
		captions,
	}: {
		captions: CaptionChunk[];
	}): string | null => {
		return insertCaptionChunksAsTextTrack({ editor, captions });
	};

	const handleGenerateTranscript = async () => {
		dispatch({ type: "start", step: "Extracting audio..." });
		try {
			const audioBlob = await extractTimelineAudio({
				tracks: editor.scenes.getActiveScene().tracks,
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});

			let result: TranscriptionResult;
			if (localTranscriptionAvailable) {
				dispatch({
					type: "update_step",
					step: "Transcribing locally with Whisper...",
				});
				result = await transcribeMediaLocally({
					file: audioBlob,
					language: selectedLanguage,
				});
			} else {
				dispatch({ type: "update_step", step: "Preparing audio..." });
				const { samples } = await decodeAudioToFloat32({
					audioBlob,
					sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
				});

				result = await transcriptionService.transcribe({
					audioData: samples,
					language: selectedLanguage === "auto" ? undefined : selectedLanguage,
					onProgress: handleProgress,
				});
			}

			let captionSegments = result.segments;
			if (translateToIndonesian) {
				dispatch({
					type: "update_step",
					step: "Menyiapkan terjemahan Indonesia...",
				});
				const translations =
					await translationService.translateEnglishToIndonesian({
						texts: captionSegments.map((segment) => segment.text),
						onProgress: handleTranslationProgress,
					});
				captionSegments = applySegmentTranslations({
					segments: captionSegments,
					translations,
				});
			}

			dispatch({ type: "update_step", step: "Generating captions..." });
			const captionChunks = buildCaptionChunks({ segments: captionSegments });

			if (!insertCaptions({ captions: captionChunks })) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			dispatch({ type: "succeed", warnings: [] });
			toast.success(`${captionChunks.length} subtitle dibuat`, {
				description: translateToIndonesian
					? "Ucapan Inggris diterjemahkan ke Indonesia. Klik subtitle untuk mengoreksi hasilnya."
					: "Klik subtitle di timeline untuk mengoreksi teks atau mengubah tampilannya.",
			});
		} catch (error) {
			console.error("Transcription failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: "Reading subtitle file..." });
		try {
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: "No valid subtitle cues were found in the subtitle file",
				});
				return;
			}

			dispatch({ type: "update_step", step: "Importing subtitles..." });

			if (!insertCaptions({ captions: result.captions })) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					`Imported ${result.captions.length} subtitle cue(s) and skipped ${result.skippedCueCount} malformed cue(s).`,
				);
			}

			dispatch({ type: "succeed", warnings: nextWarnings });
			toast.success(`${result.captions.length} subtitle diimpor`);
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;

		await handleImportFile({ file });
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	const handleTranslationChange = ({ checked }: { checked: boolean }) => {
		setTranslateToIndonesian(checked);
		if (checked) setSelectedLanguage("en");
	};

	const handleDownloadSrt = () => {
		if (exportableCaptions.length === 0) return;
		const srt = serializeSrt({ captions: exportableCaptions });
		downloadBlob({
			blob: new Blob([srt], { type: "application/x-subrip;charset=utf-8" }),
			filename: "opencut-subtitles.srt",
		});
		toast.success("Subtitle SRT diunduh");
	};

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];

	return (
		<PanelView
			title="Auto Subtitle"
			contentClassName="px-0 flex flex-col h-full"
			actions={
				<TooltipProvider>
					<div className="flex items-center gap-1.5">
						{!isProcessing &&
							activeDiagnostics.map((diagnostic) => (
								<Tooltip key={diagnostic.id}>
									<TooltipTrigger asChild>
										<Button
											variant={DIAGNOSTIC_BUTTON_VARIANT[diagnostic.severity]}
											size="icon"
											aria-label={diagnostic.message}
										>
											<HugeiconsIcon icon={AlertCircleIcon} size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{diagnostic.message}</TooltipContent>
								</Tooltip>
							))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleImportClick}
							disabled={isProcessing}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={CloudUploadIcon} />
							Import
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleDownloadSrt}
							disabled={isProcessing || exportableCaptions.length === 0}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={Download01Icon} />
							SRT
						</Button>
					</div>
				</TooltipProvider>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<Section
				showTopBorder={false}
				showBottomBorder={false}
				className="flex-1"
			>
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
						<p className="font-medium text-foreground">
							{localTranscriptionAvailable === null
								? "Mengecek mesin transkripsi..."
								: localTranscriptionAvailable
									? "Whisper lokal siap"
									: "Transkripsi browser"}
						</p>
						<p className="mt-1">
							Audio timeline ditranskripsi, dipecah menurut timestamp, lalu
							ditambahkan sebagai text track yang bisa diedit.
						</p>
					</div>
					<SectionFields>
						<SectionField label="Language">
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
								disabled={translateToIndonesian}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto detect</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label="Terjemahan">
							<div className="flex items-start gap-2 rounded-md border p-3">
								<Checkbox
									id="translate-to-indonesian"
									checked={translateToIndonesian}
									onCheckedChange={(checked) =>
										handleTranslationChange({ checked: checked === true })
									}
									disabled={isProcessing}
								/>
								<label
									htmlFor="translate-to-indonesian"
									className="cursor-pointer text-xs leading-snug"
								>
									<span className="block font-medium text-foreground">
										English → Indonesia
									</span>
									<span className="text-muted-foreground">
										Model lokal diunduh sekali saat pertama digunakan.
									</span>
								</label>
							</div>
						</SectionField>
					</SectionFields>

					<Button
						type="button"
						className="mt-auto w-full"
						onClick={handleGenerateTranscript}
						disabled={isProcessing || activeDiagnostics.length > 0}
					>
						{isProcessing && <Spinner className="mr-1" />}
						{isProcessing ? processing.step : "Buat auto subtitle"}
					</Button>
					{exportableCaptions.length > 0 && (
						<p className="text-center text-xs text-muted-foreground">
							{exportableCaptions.length} subtitle ada di timeline. Pilih satu
							subtitle untuk mengedit teks, posisi, warna, dan font.
						</p>
					)}
					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}

function collectTimelineCaptions({
	tracks,
}: {
	tracks: SceneTracks | null;
}): SubtitleCue[] {
	if (!tracks) return [];
	return tracks.overlay
		.filter((track) => track.type === "text")
		.flatMap((track) => track.elements)
		.filter((element) => /^Caption \d+$/.test(element.name))
		.flatMap((element) => {
			const content = element.params.content;
			if (typeof content !== "string" || content.trim().length === 0) return [];
			return [
				{
					text: content,
					startTime: mediaTimeToSeconds({ time: element.startTime }),
					duration: mediaTimeToSeconds({ time: element.duration }),
				},
			];
		});
}

function hasLocalTranscription({ value }: { value: unknown }): boolean {
	if (typeof value !== "object" || value === null) return false;
	return (
		"transcription" in value &&
		typeof value.transcription === "object" &&
		value.transcription !== null &&
		"available" in value.transcription &&
		value.transcription.available === true
	);
}
