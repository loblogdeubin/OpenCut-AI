"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Alert02Icon,
	CheckmarkCircle02Icon,
	MagicWand05Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/editor/use-editor";
import { mediaTime, mediaTimeToSeconds } from "@/wasm";
import {
	buildLocalRoughCutPlan,
	type RoughCutPlanPreview,
} from "@/ai/prompt-planner";
import type { LocalAiPreflight } from "@/local-ai/types";
import { transcribeMediaLocally } from "@/local-ai/transcribe";
import {
	buildVisualContactSheet,
	extractKeyframesLocally,
	type VisualKeyframeStrip,
} from "@/local-ai/keyframes";
import {
	buildChatGptBridgePackage,
	parseChatGptEditPlan,
	type BridgeTranscript,
} from "@/ai/chatgpt-bridge";
import type { EditPlanV1 } from "@/ai/editor-adapter";

const EXAMPLE_PROMPT =
	"Gabungkan semua footage, potong bagian diam lebih dari 2 detik, dan buat format vertikal 9:16.";

function formatDuration(ticks: number): string {
	const seconds = Math.max(
		0,
		Math.round(mediaTimeToSeconds({ time: mediaTime({ ticks }) })),
	);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AiPromptPanel() {
	const editor = useEditor();
	const [mediaCount, indexedMediaCount, projectRevision, projectId] = useEditor(
		(current) => {
			const assets = current.media.getAssets();
			return [
				assets.length,
				assets.filter((asset) => asset.indexStatus === "ready").length,
				current.project.getActiveOrNull()?.revision ?? 0,
				current.project.getActiveOrNull()?.metadata.id ?? null,
			];
		},
	);
	const [prompt, setPrompt] = useState(EXAMPLE_PROMPT);
	const [preview, setPreview] = useState<RoughCutPlanPreview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isPlanning, setIsPlanning] = useState(false);
	const [isApplying, setIsApplying] = useState(false);
	const [transactionId, setTransactionId] = useState<string | null>(null);
	const [localAi, setLocalAi] = useState<LocalAiPreflight | null>(null);
	const [isTranscribing, setIsTranscribing] = useState(false);
	const [transcriptionProgress, setTranscriptionProgress] = useState(0);
	const [transcripts, setTranscripts] = useState<BridgeTranscript[]>(() =>
		loadStoredTranscripts(projectId),
	);
	const [bridgeJson, setBridgeJson] = useState("");
	const [bridgePlan, setBridgePlan] = useState<EditPlanV1 | null>(null);
	const [visualStrips, setVisualStrips] = useState<VisualKeyframeStrip[]>([]);
	const [isExtractingVisuals, setIsExtractingVisuals] = useState(false);
	const [visualProgress, setVisualProgress] = useState(0);
	const [isPreparingHandoff, setIsPreparingHandoff] = useState(false);
	const [bridgePackageCopied, setBridgePackageCopied] = useState(false);

	useEffect(() => {
		const controller = new AbortController();
		void fetch("/api/local-ai/preflight", { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error("Local AI preflight failed");
				const result: unknown = await response.json();
				if (!isLocalAiPreflight(result)) {
					throw new Error("Invalid local AI preflight response");
				}
				setLocalAi(result);
			})
			.catch(() => undefined);
		return () => controller.abort();
	}, []);

	useEffect(() => {
		if (!projectId || transcripts.length === 0) return;
		try {
			sessionStorage.setItem(
				`opencut.ai.transcripts.${projectId}`,
				JSON.stringify(transcripts),
			);
		} catch {
			// Storage quota/privacy settings may disable caching; session state still works.
		}
	}, [projectId, transcripts]);

	const createPlan = async () => {
		setIsPlanning(true);
		setError(null);
		setPreview(null);
		setTransactionId(null);
		try {
			setPreview(await buildLocalRoughCutPlan({ editor, prompt }));
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Gagal membuat edit plan.",
			);
		} finally {
			setIsPlanning(false);
		}
	};

	const transcribeFootage = async () => {
		const videos = editor.media
			.getAssets()
			.filter((asset) => asset.type === "video" && asset.hasAudio !== false);
		if (videos.length === 0) {
			setError("Tidak ada footage dengan audio untuk ditranskripsi.");
			return;
		}
		setIsTranscribing(true);
		setError(null);
		setBridgePackageCopied(false);
		setTranscripts([]);
		setTranscriptionProgress(0);
		try {
			for (const [index, asset] of videos.entries()) {
				const result = await transcribeMediaLocally({ file: asset.file });
				setTranscripts((current) => [
					...current,
					{
						mediaId: asset.id,
						name: asset.name,
						text: result.text,
						segments: result.segments,
					},
				]);
				setTranscriptionProgress(
					Math.round(((index + 1) / videos.length) * 100),
				);
			}
			toast.success("Transkripsi footage selesai");
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Transkripsi lokal gagal.",
			);
		} finally {
			setIsTranscribing(false);
		}
	};

	const copyChatGptPackage = async ({
		notify = true,
	}: { notify?: boolean } = {}) => {
		if (transcripts.length === 0) return false;
		try {
			await navigator.clipboard.writeText(
				buildChatGptBridgePackage({
					editor,
					userPrompt: prompt,
					transcripts,
					visualKeyframes: visualStrips,
				}),
			);
			setBridgePackageCopied(true);
			if (notify) {
				toast.success("Paket prompt disalin", {
					description:
						"Unggah contact sheet, tempel paket ini, lalu salin JSON jawabannya.",
				});
			}
			return true;
		} catch {
			setError(
				"Browser tidak mengizinkan akses clipboard. Coba lagi dari tab aktif.",
			);
			return false;
		}
	};

	const extractVisualKeyframes = async () => {
		const videos = editor.media
			.getAssets()
			.filter((asset) => asset.type === "video");
		if (videos.length === 0) {
			setError("Tidak ada footage video untuk diekstrak.");
			return;
		}
		setIsExtractingVisuals(true);
		setVisualProgress(0);
		setError(null);
		setBridgePackageCopied(false);
		const completed: VisualKeyframeStrip[] = [];
		try {
			for (const [index, asset] of videos.entries()) {
				const blob = await extractKeyframesLocally({ file: asset.file });
				completed.push({
					mediaId: asset.id,
					name: asset.name,
					blob,
					previewUrl: URL.createObjectURL(blob),
				});
				setVisualProgress(Math.round(((index + 1) / videos.length) * 100));
			}
			visualStrips.forEach((strip) => URL.revokeObjectURL(strip.previewUrl));
			setVisualStrips(completed);
			toast.success("Contact sheet visual siap");
		} catch (cause) {
			completed.forEach((strip) => URL.revokeObjectURL(strip.previewUrl));
			setError(
				cause instanceof Error ? cause.message : "Ekstraksi visual gagal.",
			);
		} finally {
			setIsExtractingVisuals(false);
		}
	};

	const downloadVisualContactSheet = async ({
		notify = true,
	}: { notify?: boolean } = {}) => {
		try {
			const sheet = await buildVisualContactSheet(visualStrips);
			const url = URL.createObjectURL(sheet);
			const link = document.createElement("a");
			link.href = url;
			link.download = "opencut-chatgpt-contact-sheet.jpg";
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1_000);
			if (notify) toast.success("Contact sheet diunduh");
			return true;
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Gagal membuat contact sheet.",
			);
			return false;
		}
	};

	const prepareChatGptHandoff = async () => {
		if (transcripts.length === 0 || visualStrips.length === 0) return;
		setIsPreparingHandoff(true);
		setError(null);
		// Open synchronously from the user gesture so browsers do not block the tab.
		window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
		try {
			const downloaded = await downloadVisualContactSheet({ notify: false });
			if (!downloaded) return;
			const copied = await copyChatGptPackage({ notify: false });
			if (!copied) return;
			toast.success("Handoff ChatGPT Plus siap", {
				description:
					"Unggah contact sheet yang baru diunduh, lalu tempel paket dari clipboard.",
			});
		} finally {
			setIsPreparingHandoff(false);
		}
	};

	const validateBridgePlanInput = (input: string) => {
		const plan = parseChatGptEditPlan(input);
		const validation = editor.editorAdapter.validatePlan({ plan });
		if (!validation.valid) {
			throw new Error(
				validation.errors.map(({ message }) => message).join("; "),
			);
		}
		setBridgePlan(plan);
		setError(null);
		return plan;
	};

	const validateBridgePlan = () => {
		try {
			validateBridgePlanInput(bridgeJson);
		} catch (cause) {
			setBridgePlan(null);
			setError(
				cause instanceof Error ? cause.message : "EditPlan tidak valid.",
			);
		}
	};

	const pasteAndValidateBridgePlan = async () => {
		try {
			const clipboardText = await navigator.clipboard.readText();
			setBridgeJson(clipboardText);
			const plan = validateBridgePlanInput(clipboardText);
			toast.success("EditPlan ditempel dan valid", {
				description: `${plan.operations.length} operasi siap ditinjau sebelum Apply.`,
			});
		} catch (cause) {
			setBridgePlan(null);
			setError(
				cause instanceof Error
					? cause.message
					: "Clipboard tidak berisi EditPlan yang valid.",
			);
		}
	};

	const applyBridgePlan = () => {
		if (!bridgePlan) return;
		setIsApplying(true);
		setError(null);
		try {
			const result = editor.editorAdapter.applyPlan({ plan: bridgePlan });
			if (result.status === "rejected") {
				setError(
					result.validation.errors.map(({ message }) => message).join("; "),
				);
				return;
			}
			setTransactionId(result.transactionId);
			setBridgePlan(null);
			toast.success("EditPlan ChatGPT diterapkan", {
				description: "Seluruh perubahan dapat dibatalkan dengan satu Undo.",
			});
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Gagal menerapkan EditPlan ChatGPT.",
			);
		} finally {
			setIsApplying(false);
		}
	};

	const applyPlan = () => {
		if (!preview) return;
		setIsApplying(true);
		setError(null);
		try {
			const result = editor.editorAdapter.applyPlan({ plan: preview.plan });
			if (result.status === "rejected") {
				setError(
					result.validation.errors.map(({ message }) => message).join("; "),
				);
				return;
			}
			setTransactionId(result.transactionId);
			toast.success("Rough cut berhasil diterapkan", {
				description: "Seluruh perubahan dapat dibatalkan dengan satu Undo.",
			});
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Gagal menerapkan plan.",
			);
		} finally {
			setIsApplying(false);
		}
	};

	const undoPlan = () => {
		if (!transactionId) return;
		if (!editor.editorAdapter.undoTransaction({ transactionId })) {
			setError(
				"Timeline sudah berubah; transaksi AI tidak aman untuk di-undo.",
			);
			return;
		}
		setTransactionId(null);
		setPreview(null);
		setBridgePlan(null);
		toast.success("Edit AI dibatalkan");
	};

	return (
		<PanelView title="AI Rough Cut" contentClassName="pb-4">
			<div className="space-y-3">
				<div className="bg-accent/50 rounded-lg border p-3">
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2 text-sm font-medium">
							<HugeiconsIcon icon={MagicWand05Icon} className="size-4" />
							Prompt editor
						</div>
						<Badge variant="secondary">Local MVP</Badge>
					</div>
					<p className="text-muted-foreground mt-2 text-xs leading-relaxed">
						Planner lokal aktif. ChatGPT Plus/MCP belum dipasangkan; setiap plan
						tetap divalidasi oleh Rust sebelum timeline berubah.
					</p>
					{localAi && (
						<div className="mt-2 flex flex-wrap gap-1">
							<Badge
								variant={localAi.ffmpeg.available ? "outline" : "destructive"}
							>
								FFmpeg {localAi.ffmpeg.available ? "ready" : "missing"}
							</Badge>
							<Badge
								variant={
									localAi.transcription.available ? "outline" : "destructive"
								}
							>
								Transkripsi{" "}
								{localAi.transcription.available ? "ready" : "missing"}
							</Badge>
						</div>
					)}
				</div>

				<Textarea
					value={prompt}
					onChange={(event) => {
						setPrompt(event.target.value);
						setBridgePackageCopied(false);
					}}
					placeholder="Gabungkan footage, hapus bagian diam, maksimal 60 detik..."
					className="min-h-28 bg-background"
					disabled={isPlanning || isApplying}
				/>
				<div className="text-muted-foreground flex justify-between text-xs">
					<span>
						{mediaCount} media · {indexedMediaCount} indexed
					</span>
					<span>Revision {projectRevision}</span>
				</div>
				{localAi?.transcription.available && mediaCount > 0 && (
					<Button
						variant="outline"
						className="w-full"
						disabled={isTranscribing || isPlanning || isApplying}
						onClick={() => void transcribeFootage()}
					>
						{isTranscribing && <Spinner />}
						{isTranscribing
							? `Transkripsi ${transcriptionProgress}%`
							: "Transkripsi semua footage"}
					</Button>
				)}
				{transcripts.length > 0 && (
					<div className="space-y-2 rounded-lg border p-3">
						<p className="text-xs font-medium">Transkrip sesi ini</p>
						{transcripts.map((transcript) => (
							<div key={transcript.mediaId} className="text-xs">
								<p className="font-medium">{transcript.name}</p>
								<p className="text-muted-foreground line-clamp-3">
									{transcript.text || "Tidak ada ucapan terdeteksi."}
								</p>
							</div>
						))}
					</div>
				)}
				{localAi?.ffmpeg.available && mediaCount > 0 && (
					<div className="space-y-2 rounded-lg border p-3">
						<div className="flex items-center justify-between gap-2">
							<p className="text-xs font-medium">Visual keyframes</p>
							<Badge variant="outline">3 frame / footage</Badge>
						</div>
						<p className="text-muted-foreground text-xs leading-relaxed">
							Frame 10%, 50%, dan 90% diekstrak lokal menjadi satu contact sheet
							untuk diunggah ke ChatGPT Plus.
						</p>
						<Button
							variant="outline"
							className="w-full"
							disabled={
								isExtractingVisuals ||
								isTranscribing ||
								isPlanning ||
								isApplying
							}
							onClick={() => void extractVisualKeyframes()}
						>
							{isExtractingVisuals && <Spinner />}
							{isExtractingVisuals
								? `Ekstraksi visual ${visualProgress}%`
								: "Buat contact sheet visual"}
						</Button>
						{visualStrips.length > 0 && (
							<div className="space-y-2">
								<p className="text-xs font-medium">
									{visualStrips.length} strip visual siap
								</p>
								<Button
									variant="secondary"
									className="w-full"
									onClick={() => void downloadVisualContactSheet()}
								>
									Download contact sheet
								</Button>
							</div>
						)}
					</div>
				)}
				<div className="space-y-2 rounded-lg border p-3">
					<div className="flex items-center justify-between gap-2">
						<p className="text-xs font-medium">ChatGPT Plus Bridge</p>
						<Badge variant="outline">Manual</Badge>
					</div>
					<p className="text-muted-foreground text-xs leading-relaxed">
						Unggah contact sheet, lalu salin prompt, daftar media, dan transkrip
						ke ChatGPT Plus. Footage mentah tidak ikut dikirim. Tempel kembali
						JSON EditPlan untuk divalidasi sebelum timeline berubah.
					</p>
					<div className="grid grid-cols-3 gap-1.5">
						<HandoffStatus label="Prompt" ready={prompt.trim().length > 0} />
						<HandoffStatus label="Transkrip" ready={transcripts.length > 0} />
						<HandoffStatus label="Visual" ready={visualStrips.length > 0} />
					</div>
					<Button
						className="w-full"
						disabled={
							!prompt.trim() ||
							transcripts.length === 0 ||
							visualStrips.length === 0 ||
							isPreparingHandoff ||
							isTranscribing ||
							isExtractingVisuals ||
							isApplying
						}
						onClick={() => void prepareChatGptHandoff()}
					>
						{isPreparingHandoff && <Spinner />}
						{isPreparingHandoff
							? "Menyiapkan handoff..."
							: "Download, copy & buka ChatGPT"}
					</Button>
					<Button
						variant="outline"
						className="w-full"
						disabled={
							transcripts.length === 0 ||
							isTranscribing ||
							isPlanning ||
							isApplying
						}
						onClick={() => void copyChatGptPackage()}
					>
						{bridgePackageCopied
							? "Package sudah disalin"
							: "Copy package saja"}
					</Button>
					{transcripts.length === 0 && (
						<p className="text-muted-foreground text-xs">
							Jalankan transkripsi semua footage terlebih dahulu.
						</p>
					)}
					<Textarea
						value={bridgeJson}
						onChange={(event) => {
							setBridgeJson(event.target.value);
							setBridgePlan(null);
						}}
						placeholder="Tempel JSON EditPlanV1 dari ChatGPT di sini..."
						className="min-h-32 bg-background font-mono text-xs"
						disabled={isApplying}
					/>
					<Button
						variant="outline"
						className="w-full"
						disabled={isApplying}
						onClick={() => void pasteAndValidateBridgePlan()}
					>
						Paste clipboard & validasi
					</Button>
					{bridgePlan ? (
						<div className="space-y-2">
							<p className="text-xs font-medium">
								Plan valid · {bridgePlan.operations.length} operasi
							</p>
							<Button
								className="w-full"
								disabled={isApplying}
								onClick={applyBridgePlan}
							>
								{isApplying && <Spinner />}
								Apply EditPlan ChatGPT
							</Button>
						</div>
					) : (
						<Button
							variant="secondary"
							className="w-full"
							disabled={!bridgeJson.trim() || isApplying}
							onClick={validateBridgePlan}
						>
							Validasi EditPlan
						</Button>
					)}
					{transactionId && !preview && (
						<Button variant="outline" className="w-full" onClick={undoPlan}>
							Undo EditPlan ChatGPT
						</Button>
					)}
				</div>
				<Button
					className="w-full"
					onClick={() => void createPlan()}
					disabled={isPlanning || isApplying || !prompt.trim()}
				>
					{isPlanning ? <Spinner /> : <HugeiconsIcon icon={MagicWand05Icon} />}
					{isPlanning ? "Menganalisis footage..." : "Buat edit plan"}
				</Button>

				{error && (
					<div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-xs leading-relaxed">
						<div className="mb-1 flex items-center gap-2 font-medium">
							<HugeiconsIcon icon={Alert02Icon} className="size-4" />
							Plan tidak dapat diproses
						</div>
						{error}
					</div>
				)}

				{preview && (
					<PlanPreview
						preview={preview}
						transactionId={transactionId}
						isApplying={isApplying}
						onApply={applyPlan}
						onRevise={() => setPreview(null)}
						onUndo={undoPlan}
					/>
				)}
			</div>
		</PanelView>
	);
}

function PlanPreview({
	preview,
	transactionId,
	isApplying,
	onApply,
	onRevise,
	onUndo,
}: {
	preview: RoughCutPlanPreview;
	transactionId: string | null;
	isApplying: boolean;
	onApply: () => void;
	onRevise: () => void;
	onUndo: () => void;
}) {
	return (
		<div className="space-y-3 rounded-lg border p-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm font-medium">
					<HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
					Plan valid
				</div>
				<Badge variant="outline">Preview</Badge>
			</div>
			<div className="grid grid-cols-2 gap-2 text-xs">
				<Summary label="Footage" value={String(preview.mediaCount)} />
				<Summary label="Segmen" value={String(preview.segmentCount)} />
				<Summary
					label="Durasi hasil"
					value={formatDuration(preview.expectedDurationTicks)}
				/>
				<Summary
					label="Durasi dipangkas"
					value={formatDuration(preview.removedSilenceTicks)}
				/>
			</div>
			{preview.replacedElementCount > 0 && (
				<p className="text-caution text-xs">
					{preview.replacedElementCount} clip di main timeline akan diganti.
				</p>
			)}
			{preview.warnings.map((warning) => (
				<p
					key={warning}
					className="text-muted-foreground text-xs leading-relaxed"
				>
					• {warning}
				</p>
			))}
			{transactionId ? (
				<div className="space-y-2">
					<p className="text-xs font-medium">Rough cut sudah diterapkan.</p>
					<Button variant="outline" className="w-full" onClick={onUndo}>
						Undo rough cut AI
					</Button>
				</div>
			) : (
				<div className="flex gap-2">
					<Button variant="outline" className="flex-1" onClick={onRevise}>
						Revisi
					</Button>
					<Button className="flex-1" onClick={onApply} disabled={isApplying}>
						{isApplying && <Spinner />}
						Apply plan
					</Button>
				</div>
			)}
		</div>
	);
}

function Summary({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-accent/50 rounded-md p-2">
			<div className="text-muted-foreground">{label}</div>
			<div className="mt-0.5 font-medium">{value}</div>
		</div>
	);
}

function HandoffStatus({ label, ready }: { label: string; ready: boolean }) {
	return (
		<div
			className={`rounded-md border px-2 py-1.5 text-center text-[11px] ${
				ready
					? "border-primary/30 bg-primary/5 text-primary"
					: "text-muted-foreground"
			}`}
		>
			{ready ? "✓" : "○"} {label}
		</div>
	);
}

function isBridgeTranscriptArray(value: unknown): value is BridgeTranscript[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				typeof item === "object" &&
				item !== null &&
				"mediaId" in item &&
				typeof item.mediaId === "string" &&
				"name" in item &&
				typeof item.name === "string" &&
				"text" in item &&
				typeof item.text === "string" &&
				"segments" in item &&
				Array.isArray(item.segments) &&
				item.segments.every(
					(segment: unknown) =>
						typeof segment === "object" &&
						segment !== null &&
						"text" in segment &&
						typeof segment.text === "string" &&
						"start" in segment &&
						typeof segment.start === "number" &&
						Number.isFinite(segment.start) &&
						"end" in segment &&
						typeof segment.end === "number" &&
						Number.isFinite(segment.end),
				),
		)
	);
}

function loadStoredTranscripts(projectId: string | null): BridgeTranscript[] {
	if (!projectId || typeof window === "undefined") return [];
	try {
		const stored = sessionStorage.getItem(
			`opencut.ai.transcripts.${projectId}`,
		);
		if (!stored) return [];
		const parsed: unknown = JSON.parse(stored);
		return isBridgeTranscriptArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function isLocalAiPreflight(value: unknown): value is LocalAiPreflight {
	if (typeof value !== "object" || value === null) return false;
	return (
		"ffmpeg" in value &&
		typeof value.ffmpeg === "object" &&
		value.ffmpeg !== null &&
		"available" in value.ffmpeg &&
		typeof value.ffmpeg.available === "boolean" &&
		"ffprobe" in value &&
		typeof value.ffprobe === "object" &&
		value.ffprobe !== null &&
		"available" in value.ffprobe &&
		typeof value.ffprobe.available === "boolean" &&
		"transcription" in value &&
		typeof value.transcription === "object" &&
		value.transcription !== null &&
		"available" in value.transcription &&
		typeof value.transcription.available === "boolean"
	);
}
