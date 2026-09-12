"use client";

import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import {
	REKAH_STUDIO_STICKER_ID,
	REKAH_STUDIO_URL,
} from "@/stickers/providers/templates";
import { buildStickerElement } from "@/timeline/element-utils";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";

const TEMPLATE_SIZE = { width: 1080, height: 1920 } as const;

export function TemplatesView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const mediaAssets = useEditor((currentEditor) =>
		currentEditor.media.getAssets(),
	);
	const [isApplying, setIsApplying] = useState(false);

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

	return (
		<PanelView title="Templates" contentClassName="p-3">
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
				</div>
			</div>
		</PanelView>
	);
}
