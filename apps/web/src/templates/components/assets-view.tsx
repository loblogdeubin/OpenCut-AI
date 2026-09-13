"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import {
	REKAH_STUDIO_STICKER_ID,
	REKAH_STUDIO_URL,
} from "@/stickers/providers/templates";
import {
	buildElementFromMedia,
	buildStickerElement,
	buildTextElement,
} from "@/timeline/element-utils";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { processMediaAssets } from "@/media/processing";
import {
	deleteTemplatePreset,
	loadTemplatePresets,
	saveTemplatePreset,
	type StoredTemplatePreset,
} from "@/templates/preset-storage";

const TEMPLATE_SIZE = { width: 1080, height: 1920 } as const;

export function TemplatesView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const mediaAssets = useEditor((currentEditor) =>
		currentEditor.media.getAssets(),
	);
	const [isApplying, setIsApplying] = useState(false);
	const [customText, setCustomText] = useState("Tulis judul di sini");
	const [pendingImageKind, setPendingImageKind] = useState<"photo" | "logo">(
		"photo",
	);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const presetInputRef = useRef<HTMLInputElement>(null);
	const [presets, setPresets] = useState<StoredTemplatePreset[]>([]);
	const [presetUrls, setPresetUrls] = useState<Record<string, string>>({});

	useEffect(() => {
		void loadTemplatePresets()
			.then(setPresets)
			.catch(() => toast.error("Preset gambar tidak dapat dimuat"));
	}, []);

	useEffect(() => {
		const urls = Object.fromEntries(
			presets.map((preset) => [preset.id, URL.createObjectURL(preset.file)]),
		);
		setPresetUrls(urls);
		return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
	}, [presets]);

	const selectedRef =
		selectedElements.length === 1 ? selectedElements[0] : null;
	const selectedEntry = selectedRef
		? editor.timeline.getElementsWithTracks({ elements: [selectedRef] })[0]
		: null;
	const selectedVideo =
		selectedEntry?.element.type === "video" ? selectedEntry.element : null;

	const applyRekahTemplate = async () => {
		if (!selectedEntry || !selectedVideo) {
			toast.error("Pilih satu video di timeline terlebih dahulu");
			return;
		}

		setIsApplying(true);
		try {
			const media = mediaAssets.find(
				(asset) => asset.id === selectedVideo.mediaId,
			);
			const sourceWidth = media?.width ?? TEMPLATE_SIZE.width;
			const sourceHeight = media?.height ?? TEMPLATE_SIZE.height;
			const containScale = Math.min(
				TEMPLATE_SIZE.width / sourceWidth,
				TEMPLATE_SIZE.height / sourceHeight,
			);
			const coverScale = Math.max(
				TEMPLATE_SIZE.width / sourceWidth,
				TEMPLATE_SIZE.height / sourceHeight,
			);
			const scale = coverScale / containScale;

			await editor.project.updateSettings({
				settings: {
					canvasSize: TEMPLATE_SIZE,
					canvasSizeMode: "preset",
				},
			});
			editor.timeline.updateElements({
				updates: [
					{
						trackId: selectedEntry.track.id,
						elementId: selectedVideo.id,
						patch: {
							params: {
								...selectedVideo.params,
								"transform.positionX": 0,
								"transform.positionY": 0,
								"transform.scaleX": scale,
								"transform.scaleY": scale,
							},
						},
					},
				],
			});

			const overlay = buildStickerElement({
				stickerId: REKAH_STUDIO_STICKER_ID,
				name: "Rekah Studio UGC (brand overlay)",
				startTime: selectedVideo.startTime,
				intrinsicWidth: TEMPLATE_SIZE.width,
				intrinsicHeight: TEMPLATE_SIZE.height,
			});
			editor.timeline.insertElement({
				placement: { mode: "auto", trackType: "graphic" },
				element: { ...overlay, duration: selectedVideo.duration },
			});
			toast.success("Template Rekah Studio diterapkan");
		} catch (error) {
			console.error("Failed to apply Rekah Studio template:", error);
			toast.error("Template gagal diterapkan");
		} finally {
			setIsApplying(false);
		}
	};

	const requireSelectedVideo = () => {
		if (!selectedVideo) {
			toast.error("Pilih satu video di timeline terlebih dahulu");
			return false;
		}
		return true;
	};

	const chooseImage = ({ kind }: { kind: "photo" | "logo" }) => {
		if (!requireSelectedVideo()) return;
		setPendingImageKind(kind);
		imageInputRef.current?.click();
	};

	const attachImage = async ({
		file,
		kind,
	}: {
		file: File;
		kind: "photo" | "logo";
	}) => {
		if (!selectedVideo) return;
		const processed = (await processMediaAssets({ files: [file] }))[0];
		if (!processed || processed.type !== "image") {
			throw new Error("File harus berupa foto atau logo gambar");
		}
		const added = await editor.media.addMediaAsset({
			projectId: editor.project.getActive().metadata.id,
			asset: processed,
		});
		if (!added) throw new Error("Gambar tidak dapat disimpan");
		const element = buildElementFromMedia({
			mediaId: added.id,
			mediaType: "image",
			name:
				kind === "logo" ? `Logo: ${processed.name}` : `Foto: ${processed.name}`,
			duration: selectedVideo.duration,
			startTime: selectedVideo.startTime,
		});
		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "video" },
			element: {
				...element,
				params: {
					...element.params,
					"transform.positionX": kind === "logo" ? 320 : 0,
					"transform.positionY": kind === "logo" ? -720 : 360,
					"transform.scaleX": kind === "logo" ? 0.28 : 0.5,
					"transform.scaleY": kind === "logo" ? 0.28 : 0.5,
				},
			},
		});
		toast.success(
			`${kind === "logo" ? "Logo" : "Foto"} ditambahkan sebagai layer editable`,
		);
	};

	const attachText = () => {
		if (!requireSelectedVideo() || !selectedVideo) return;
		const content = customText.trim();
		if (!content) {
			toast.error("Isi teks terlebih dahulu");
			return;
		}
		const element = buildTextElement({
			startTime: selectedVideo.startTime,
			raw: {
				name: "Rekah template text",
				duration: selectedVideo.duration,
				params: {
					content,
					fontFamily: "DM Sans",
					fontSize: 56,
					fontWeight: 700,
					color: "#111827",
					textAlign: "center",
					"transform.positionX": 0,
					"transform.positionY": -620,
				},
			},
		});
		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "text" },
			element,
		});
		toast.success("Teks ditambahkan sebagai layer editable");
	};

	const storePreset = async ({ file }: { file: File }) => {
		if (!file.type.startsWith("image/")) {
			toast.error("Preset harus berupa gambar");
			return;
		}
		try {
			const preset = await saveTemplatePreset({ file });
			setPresets((current) => [preset, ...current]);
			toast.success("Gambar disimpan sebagai preset");
		} catch {
			toast.error("Gagal menyimpan preset gambar");
		}
	};

	const removePreset = async ({ id }: { id: string }) => {
		try {
			await deleteTemplatePreset({ id });
			setPresets((current) => current.filter((preset) => preset.id !== id));
			toast.success("Preset dihapus");
		} catch {
			toast.error("Preset tidak dapat dihapus");
		}
	};

	return (
		<PanelView title="Templates" contentClassName="p-3">
			<input
				ref={imageInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file)
						void attachImage({ file, kind: pendingImageKind }).catch((error) =>
							toast.error(
								error instanceof Error
									? error.message
									: "Gagal menambahkan gambar",
							),
						);
				}}
			/>
			<input
				ref={presetInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) void storePreset({ file });
				}}
			/>
			<div className="overflow-hidden rounded-xl border bg-card">
				<div className="relative aspect-[9/16] max-h-64 w-full bg-muted">
					<Image
						src={REKAH_STUDIO_URL}
						alt="Rekah Studio UGC template"
						fill
						className="object-contain"
						unoptimized
					/>
				</div>
				<div className="space-y-3 p-3">
					<div>
						<p className="text-sm font-medium">Rekah Studio UGC</p>
						<p className="text-xs text-muted-foreground">
							Format 9:16, crop proporsional, dan brand overlay.
						</p>
					</div>
					<Button
						className="w-full"
						disabled={isApplying || !selectedVideo}
						onClick={applyRekahTemplate}
					>
						{isApplying ? "Menerapkan…" : "Terapkan ke video terpilih"}
					</Button>
					{!selectedVideo && (
						<p className="text-center text-xs text-muted-foreground">
							Klik satu klip video di timeline untuk mengaktifkan preset.
						</p>
					)}
					<div className="space-y-2 border-t pt-3">
						<p className="text-xs font-medium">Tambahkan konten editable</p>
						<div className="grid grid-cols-2 gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => chooseImage({ kind: "photo" })}
							>
								Attach foto
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => chooseImage({ kind: "logo" })}
							>
								Attach logo
							</Button>
						</div>
						<Input
							value={customText}
							onChange={(event) => setCustomText(event.target.value)}
							placeholder="Teks template"
						/>
						<Button
							variant="outline"
							size="sm"
							className="w-full"
							onClick={attachText}
						>
							Attach teks
						</Button>
						<p className="text-[11px] text-muted-foreground">
							Foto, teks, dan logo menjadi layer terpisah. Klik layer di
							preview/timeline untuk menggeser, memperbesar, memutar, atau
							memberi keyframe.
						</p>
					</div>
				</div>
			</div>
			<div className="mt-3 space-y-3 rounded-xl border bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<div>
						<p className="text-sm font-medium">Preset gambar saya</p>
						<p className="text-[11px] text-muted-foreground">
							Tersimpan lokal di perangkat ini.
						</p>
					</div>
					<Button
						size="sm"
						variant="outline"
						onClick={() => presetInputRef.current?.click()}
					>
						Simpan preset
					</Button>
				</div>
				{presets.length === 0 ? (
					<p className="rounded-lg bg-muted p-3 text-center text-xs text-muted-foreground">
						Belum ada preset personal.
					</p>
				) : (
					<div className="grid grid-cols-2 gap-2">
						{presets.map((preset) => (
							<div
								key={preset.id}
								className="overflow-hidden rounded-lg border"
							>
								<div className="relative aspect-square bg-muted">
									{presetUrls[preset.id] && (
										<Image
											src={presetUrls[preset.id]}
											alt={preset.name}
											fill
											className="object-contain"
											unoptimized
										/>
									)}
								</div>
								<div className="space-y-2 p-2">
									<p
										className="truncate text-xs font-medium"
										title={preset.name}
									>
										{preset.name}
									</p>
									<Button
										size="sm"
										className="w-full"
										disabled={!selectedVideo}
										onClick={() =>
											void attachImage({
												file: preset.file,
												kind: "photo",
											}).catch((error) =>
												toast.error(
													error instanceof Error
														? error.message
														: "Gagal attach preset",
												),
											)
										}
									>
										Attach
									</Button>
									<Button
										size="sm"
										variant="ghost"
										className="w-full text-destructive"
										onClick={() => void removePreset({ id: preset.id })}
									>
										Hapus
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</PanelView>
	);
}
