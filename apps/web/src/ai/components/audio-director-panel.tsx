"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { Command } from "@/commands";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/editor/use-editor";
import type { BridgeTranscript } from "@/ai/chatgpt-bridge";
import {
	buildAudioCatalogContract,
	buildAudioDirectorBridgePackage,
	parseChatGptAudioPlan,
} from "@/ai/audio-director-bridge";
import { applyAudioPlan } from "@/ai/audio-plan-apply";
import { validateAudioPlan, type AudioPlanV1 } from "@/ai/editor-adapter";
import {
	applyLocalDubbingFromCaptions,
	collectCaptionsForDubbing,
} from "@/ai/local-dubbing-apply";
import { getLocalDubbingPreflight } from "@/local-ai/dubbing";
import type {
	LocalDubbingPreflight,
	LocalDubbingProvider,
} from "@/local-ai/types";
import { soundEffectToCatalogEntry } from "@/sounds/catalog-adapter";
import { isSoundCatalogEntrySafeForEditing } from "@/sounds/catalog";
import type { SoundCatalogEntry } from "@/sounds/catalog-types";

const searchResultSchema = z.object({
	results: z.array(
		z.object({
			id: z.number(),
			name: z.string(),
			description: z.string(),
			url: z.string(),
			previewUrl: z.string().optional(),
			downloadUrl: z.string().optional(),
			duration: z.number(),
			filesize: z.number(),
			type: z.string(),
			channels: z.number(),
			bitrate: z.number(),
			bitdepth: z.number(),
			samplerate: z.number(),
			username: z.string(),
			tags: z.array(z.string()),
			license: z.string(),
			created: z.string(),
			downloads: z.number(),
			rating: z.number(),
			ratingCount: z.number(),
		}),
	),
});

const FREESOUND_KEY_STORAGE = "opencut-freesound-api-key";

export function AudioDirectorPanel({
	prompt,
	transcripts,
}: {
	prompt: string;
	transcripts: BridgeTranscript[];
}) {
	const editor = useEditor();
	const captionCount = useEditor(
		(current) => collectCaptionsForDubbing({ editor: current }).length,
	);
	const [catalogEntries, setCatalogEntries] = useState<SoundCatalogEntry[]>([]);
	const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
	const [audioPlanJson, setAudioPlanJson] = useState("");
	const [audioPlan, setAudioPlan] = useState<AudioPlanV1 | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isApplying, setIsApplying] = useState(false);
	const [lastCommand, setLastCommand] = useState<Command | null>(null);
	const [attributions, setAttributions] = useState<string[]>([]);
	const [dubbing, setDubbing] = useState<LocalDubbingPreflight | null>(null);
	const [provider, setProvider] = useState<LocalDubbingProvider | undefined>();
	const [voice, setVoice] = useState<string | undefined>();
	const [muteOriginalAudio, setMuteOriginalAudio] = useState(true);
	const [dubbingProgress, setDubbingProgress] = useState(0);
	const [freesoundApiKey, setFreesoundApiKey] = useState("");

	const loadCatalog = useCallback(async () => {
		setIsLoadingCatalog(true);
		setError(null);
		try {
			const headers = freesoundApiKey.trim()
				? { "x-opencut-freesound-key": freesoundApiKey.trim() }
				: undefined;
			const responses = await Promise.all([
				fetch(
					"/api/sounds/search?type=songs&page=1&page_size=20&sort=downloads&commercial_only=true",
					{ headers },
				),
				fetch(
					"/api/sounds/search?type=effects&page=1&page_size=50&sort=downloads&commercial_only=true",
					{ headers },
				),
			]);
			for (const response of responses) {
				if (!response.ok) {
					throw new Error(
						"Katalog audio gagal dimuat. Periksa FREESOUND_API_KEY dan koneksi internet.",
					);
				}
			}
			const payloads = await Promise.all(
				responses.map(async (response) =>
					searchResultSchema.parse(await response.json()),
				),
			);
			const entries = payloads
				.flatMap((payload) => payload.results)
				.flatMap((sound) => {
					const entry = soundEffectToCatalogEntry({ sound });
					return entry ? [entry] : [];
				})
				.filter((entry) => isSoundCatalogEntrySafeForEditing({ entry }));
			setCatalogEntries([
				...new Map(entries.map((entry) => [entry.id, entry])).values(),
			]);
		} catch (cause) {
			setCatalogEntries([]);
			setError(
				cause instanceof Error ? cause.message : "Katalog audio gagal dimuat.",
			);
		} finally {
			setIsLoadingCatalog(false);
		}
	}, [freesoundApiKey]);

	useEffect(() => {
		// Hydrate a device-local credential after the server render.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setFreesoundApiKey(localStorage.getItem(FREESOUND_KEY_STORAGE) ?? "");
	}, []);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void loadCatalog();
			void getLocalDubbingPreflight()
				.then((result) => {
					setDubbing(result);
					setProvider(result.defaultProvider);
					const selected = result.providers.find(
						(candidate) => candidate.id === result.defaultProvider,
					);
					setVoice(selected?.defaultVoice ?? selected?.voices[0]?.id);
				})
				.catch(() => undefined);
		}, 0);
		return () => window.clearTimeout(timer);
	}, [loadCatalog]);

	const saveFreesoundApiKey = () => {
		const value = freesoundApiKey.trim();
		if (value) localStorage.setItem(FREESOUND_KEY_STORAGE, value);
		else localStorage.removeItem(FREESOUND_KEY_STORAGE);
		void loadCatalog();
	};

	const selectedProvider = useMemo(
		() => dubbing?.providers.find((candidate) => candidate.id === provider),
		[dubbing, provider],
	);
	const catalogSummary = useMemo(
		() => ({
			music: catalogEntries.filter((entry) => entry.kind === "music").length,
			sfx: catalogEntries.filter((entry) => entry.kind !== "music").length,
		}),
		[catalogEntries],
	);

	const copyAudioDirectorPackage = async () => {
		try {
			const value = buildAudioDirectorBridgePackage({
				editor,
				userPrompt: prompt,
				transcripts,
				catalogEntries,
			});
			await navigator.clipboard.writeText(value);
			window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
			toast.success("Paket Audio Director disalin");
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Gagal menyalin paket audio.",
			);
		}
	};

	const validateInput = ({ input }: { input: string }) => {
		const plan = parseChatGptAudioPlan({ input });
		const { snapshot } = editor.editorAdapter.getProjectSnapshot();
		const validation = validateAudioPlan({
			snapshot,
			catalog: buildAudioCatalogContract({ entries: catalogEntries }),
			plan,
			phase: "preflight",
		});
		if (!validation.valid) {
			throw new Error(
				validation.errors.map(({ message }) => message).join("; "),
			);
		}
		setWarnings(validation.warnings);
		setAudioPlan(plan);
		setError(null);
		return plan;
	};

	const pasteAndValidate = async () => {
		try {
			const value = await navigator.clipboard.readText();
			setAudioPlanJson(value);
			const plan = validateInput({ input: value });
			toast.success(`${plan.operations.length} audio siap diterapkan`);
		} catch (cause) {
			setAudioPlan(null);
			setError(
				cause instanceof Error ? cause.message : "AudioPlan tidak valid.",
			);
		}
	};

	const applyPlan = async () => {
		if (!audioPlan) return;
		setIsApplying(true);
		setError(null);
		try {
			const result = await applyAudioPlan({
				editor,
				plan: audioPlan,
				catalogEntries,
			});
			setLastCommand(result.command);
			setAttributions(result.attributions);
			setAudioPlan(null);
			toast.success(`${result.insertedCount} audio ditambahkan`, {
				description: "Musik, SFX, fade, dan ducking masuk sebagai satu Undo.",
			});
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "AudioPlan gagal diterapkan.",
			);
		} finally {
			setIsApplying(false);
		}
	};

	const applyDubbing = async () => {
		setIsApplying(true);
		setDubbingProgress(0);
		setError(null);
		try {
			const result = await applyLocalDubbingFromCaptions({
				editor,
				provider,
				voice,
				muteOriginalAudio,
				onProgress: ({ completed, total }) =>
					setDubbingProgress(Math.round((completed / total) * 100)),
			});
			setLastCommand(result.command);
			toast.success(`${result.insertedCount} segmen dub ditambahkan`, {
				description: "Timing mengikuti setiap blok subtitle di timeline.",
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Auto dubber gagal.");
		} finally {
			setIsApplying(false);
		}
	};

	const undoLastAudioAction = () => {
		if (
			!lastCommand ||
			!editor.command.undoExpected({ command: lastCommand })
		) {
			setError(
				"Timeline sudah berubah; aksi audio ini tidak aman untuk di-undo.",
			);
			return;
		}
		setLastCommand(null);
		toast.success("Aksi audio AI dibatalkan");
	};

	return (
		<div className="space-y-3 rounded-lg border p-3">
			<div className="flex items-center justify-between gap-2">
				<p className="text-xs font-medium">AI Audio Director</p>
				<Badge variant="outline">GPT Bridge + lokal</Badge>
			</div>
			<p className="text-muted-foreground text-xs leading-relaxed">
				GPT memilih musik dan transition SFX dari katalog yang lisensinya
				terverifikasi. Rust memvalidasi plan sebelum timeline berubah.
			</p>
			<div className="flex items-center justify-between text-xs">
				<span>
					{catalogSummary.music} musik · {catalogSummary.sfx} SFX aman
				</span>
				<Button
					variant="ghost"
					size="sm"
					disabled={isLoadingCatalog || isApplying}
					onClick={() => void loadCatalog()}
				>
					{isLoadingCatalog ? <Spinner /> : "Refresh"}
				</Button>
			</div>
			{catalogEntries.length === 0 && !isLoadingCatalog && (
				<div className="space-y-2 rounded-md border p-2">
					<p className="text-muted-foreground text-xs leading-relaxed">
						Masukkan token API Freesound gratis. Token hanya disimpan lokal di
						perangkat ini.
					</p>
					<Input
						type="password"
						value={freesoundApiKey}
						onChange={(event) => setFreesoundApiKey(event.target.value)}
						placeholder="Freesound API token"
						autoComplete="off"
					/>
					<div className="flex gap-2">
						<Button
							variant="outline"
							className="flex-1"
							onClick={() =>
								window.open(
									"https://freesound.org/apiv2/apply/",
									"_blank",
									"noopener,noreferrer",
								)
							}
						>
							Ambil token gratis
						</Button>
						<Button
							className="flex-1"
							disabled={!freesoundApiKey.trim()}
							onClick={saveFreesoundApiKey}
						>
							Simpan & muat
						</Button>
					</div>
				</div>
			)}
			<Button
				className="w-full"
				disabled={catalogEntries.length === 0 || isApplying}
				onClick={() => void copyAudioDirectorPackage()}
			>
				Copy package & buka ChatGPT
			</Button>
			<Textarea
				value={audioPlanJson}
				onChange={(event) => {
					setAudioPlanJson(event.target.value);
					setAudioPlan(null);
				}}
				placeholder="Tempel JSON AudioPlanV1 dari ChatGPT..."
				className="min-h-28 bg-background font-mono text-xs"
				disabled={isApplying}
			/>
			<div className="flex gap-2">
				<Button
					variant="outline"
					className="flex-1"
					disabled={isApplying}
					onClick={() => void pasteAndValidate()}
				>
					Paste & validasi
				</Button>
				<Button
					className="flex-1"
					disabled={!audioPlan || isApplying}
					onClick={() => void applyPlan()}
				>
					{isApplying && <Spinner />}
					Apply audio
				</Button>
			</div>
			{warnings.map((warning) => (
				<p key={warning} className="text-muted-foreground text-xs">
					• {warning}
				</p>
			))}

			<div className="space-y-2 border-t pt-3">
				<div className="flex items-center justify-between gap-2">
					<p className="text-xs font-medium">Auto dubber dari subtitle</p>
					<Badge variant={dubbing?.available ? "outline" : "destructive"}>
						{dubbing?.available ? "Free lokal" : "Tidak tersedia"}
					</Badge>
				</div>
				<p className="text-muted-foreground text-xs leading-relaxed">
					Membaca {captionCount} blok subtitle timeline. Windows Speech gratis;
					Piper dapat dipakai jika dikonfigurasi.
				</p>
				<Select
					value={provider}
					onValueChange={(value) => {
						const next = parseDubbingProvider({ value });
						if (!next) return;
						setProvider(next);
						const candidate = dubbing?.providers.find(
							(item) => item.id === next,
						);
						setVoice(candidate?.defaultVoice ?? candidate?.voices[0]?.id);
					}}
				>
					<SelectTrigger>
						<SelectValue placeholder="Pilih engine dubber" />
					</SelectTrigger>
					<SelectContent>
						{dubbing?.providers
							.filter((candidate) => candidate.available)
							.map((candidate) => (
								<SelectItem key={candidate.id} value={candidate.id}>
									{candidate.id === "windows-sapi"
										? "Windows Speech (gratis)"
										: "Piper lokal"}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
				<Select value={voice} onValueChange={setVoice}>
					<SelectTrigger>
						<SelectValue placeholder="Pilih voice" />
					</SelectTrigger>
					<SelectContent>
						{selectedProvider?.voices.map((candidate) => (
							<SelectItem key={candidate.id} value={candidate.id}>
								{candidate.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="flex items-center gap-2 text-xs">
					<Checkbox
						id="ai-dubber-mute-original"
						checked={muteOriginalAudio}
						onCheckedChange={(checked) =>
							setMuteOriginalAudio(checked === true)
						}
					/>
					<label htmlFor="ai-dubber-mute-original">
						Matikan audio asli setelah dub diterapkan
					</label>
				</div>
				<Button
					className="w-full"
					disabled={
						!dubbing?.available ||
						!provider ||
						!voice ||
						captionCount === 0 ||
						isApplying
					}
					onClick={() => void applyDubbing()}
				>
					{isApplying && <Spinner />}
					{dubbingProgress > 0 && isApplying
						? `Membuat dub ${dubbingProgress}%`
						: "Buat dub semua subtitle"}
				</Button>
			</div>

			{attributions.length > 0 && (
				<div className="space-y-1 border-t pt-3 text-xs">
					<p className="font-medium">Atribusi wajib</p>
					{attributions.map((value) => (
						<p key={value} className="text-muted-foreground">
							{value}
						</p>
					))}
					<Button
						variant="outline"
						className="w-full"
						onClick={() => {
							void navigator.clipboard.writeText(attributions.join("\n"));
							toast.success("Atribusi disalin");
						}}
					>
						Copy atribusi
					</Button>
				</div>
			)}
			{lastCommand && (
				<Button
					variant="outline"
					className="w-full"
					onClick={undoLastAudioAction}
				>
					Undo aksi audio terakhir
				</Button>
			)}
			{error && (
				<p className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-2 text-xs leading-relaxed">
					{error}
				</p>
			)}
		</div>
	);
}

function parseDubbingProvider({
	value,
}: {
	value: string;
}): LocalDubbingProvider | undefined {
	return value === "windows-sapi" || value === "piper" ? value : undefined;
}
