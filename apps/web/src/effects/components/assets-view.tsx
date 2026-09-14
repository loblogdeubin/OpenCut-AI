"use client";

import { useEffect, useRef, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES } from "@/effects";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import type { EffectDefinition } from "@/effects/types";

const AI_VIDEO_BACKGROUND_EFFECT = "ai-video-background-remover";

function previewParamsForEffect({
	effectType,
}: {
	effectType: string;
}): Record<string, string | number> {
	if (effectType === "color-correction") {
		return {
			exposure: 0.25,
			contrast: 18,
			highlights: -15,
			shadows: 18,
			temperature: 12,
			tint: 0,
			saturation: 8,
			vibrance: 24,
			intensity: 100,
		};
	}
	if (effectType === "background-remover") {
		return {
			keyColor: "#ffffff",
			threshold: 8,
			softness: 14,
			spill: 0,
		};
	}
	return {};
}

export function EffectsView() {
	const effects = effectsRegistry.getAll();

	return (
		<PanelView title="Effects">
			<EffectsGrid effects={effects} />
		</PanelView>
	);
}

function EffectsGrid({ effects }: { effects: EffectDefinition[] }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{effects.map((effect) => (
				<EffectItem key={effect.type} effect={effect} />
			))}
		</div>
	);
}

function EffectPreviewCanvas({ effectType }: { effectType: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType,
					params: previewParamsForEffect({ effectType }),
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [effectType]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function EffectItem({ effect }: { effect: EffectDefinition }) {
	const editor = useEditor();
	const selectedRefs = useEditor((core) =>
		core.selection.getSelectedElements(),
	);
	const requiresVideoClip = effect.type === AI_VIDEO_BACKGROUND_EFFECT;

	const handleAddToTimeline = useCallback(() => {
		if (requiresVideoClip) {
			const selectedVideo = editor.timeline
				.getElementsWithTracks({ elements: selectedRefs })
				.find(({ element }) => element.type === "video");
			if (!selectedVideo) {
				toast.error("Pilih satu klip video terlebih dahulu");
				return;
			}
			if (
				selectedVideo.element.type === "video" &&
				selectedVideo.element.effects?.some(
					(candidate) => candidate.type === effect.type,
				)
			) {
				toast.info("AI background remover sudah ada pada klip ini");
				return;
			}
			const effectId = editor.timeline.addClipEffect({
				trackId: selectedVideo.track.id,
				elementId: selectedVideo.element.id,
				effectType: effect.type,
			});
			if (!effectId) {
				toast.error("Track terkunci atau efek tidak dapat diterapkan");
				return;
			}
			toast.success("AI background remover ditambahkan ke klip");
			return;
		}
		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: effect.type,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	}, [editor, effect.type, requiresVideoClip, selectedRefs]);

	const preview = (
		<div className="relative size-full bg-[linear-gradient(45deg,#ddd_25%,transparent_25%),linear-gradient(-45deg,#ddd_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ddd_75%),linear-gradient(-45deg,transparent_75%,#ddd_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]">
			<EffectPreviewCanvas effectType={effect.type} />
			{requiresVideoClip && (
				<span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
					<Sparkles className="size-3" /> AI
				</span>
			)}
		</div>
	);

	return (
		<DraggableItem
			name={effect.name}
			preview={preview}
			dragData={{
				id: effect.type,
				name: effect.name,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
			isDraggable={!requiresVideoClip}
		/>
	);
}
