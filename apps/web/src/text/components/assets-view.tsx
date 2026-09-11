"use client";

import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import type { TextElement } from "@/timeline";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import type { MediaTime } from "@/wasm";
import { cn } from "@/utils/ui";
import { toast } from "sonner";
import {
	buildTextMotionAnimations,
	isSubtitleTextElement,
	TEXT_MOTION_PRESETS,
	type TextMotionPresetId,
} from "@/text/motion-presets";

export function TextView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const activeScene = useEditor((currentEditor) =>
		currentEditor.scenes.getActiveSceneOrNull(),
	);
	const selectedText = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.filter(
			(entry): entry is typeof entry & { element: TextElement } =>
				entry.element.type === "text",
		)
		.map(({ track, element }) => ({ trackId: track.id, element }));
	const subtitles =
		activeScene?.tracks.overlay.flatMap((track) =>
			track.type !== "text"
				? []
				: track.elements
						.filter((element) => isSubtitleTextElement({ element }))
						.map((element) => ({ trackId: track.id, element })),
		) ?? [];

	const handleAddToTimeline = ({ currentTime }: { currentTime: MediaTime }) => {
		const activeScene = editor.scenes.getActiveScene();
		if (!activeScene) return;

		const element = buildTextElement({
			raw: DEFAULTS.text.element,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	const applyPreset = ({
		preset,
		targets,
	}: {
		preset: TextMotionPresetId;
		targets: Array<{ trackId: string; element: TextElement }>;
	}) => {
		try {
			editor.timeline.updateElements({
				updates: targets.map(({ trackId, element }) => ({
					trackId,
					elementId: element.id,
					patch: {
						animations: buildTextMotionAnimations({ element, preset }),
					},
				})),
			});
			toast.success(`Motion diterapkan ke ${targets.length} teks`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Motion gagal diterapkan",
			);
		}
	};

	const handlePreset = ({ preset }: { preset: TextMotionPresetId }) => {
		if (selectedText.length > 0) {
			applyPreset({ preset, targets: selectedText });
			return;
		}

		const currentTime = editor.playback.getCurrentTime();
		const base = buildTextElement({
			raw: {
				...DEFAULTS.text.element,
				name: "Motion text",
				params: {
					...DEFAULTS.text.element.params,
					content: "Ganti teks ini",
				},
			},
			startTime: currentTime,
		});
		if (base.type !== "text") return;
		const motionSource: TextElement = {
			...base,
			id: "text-motion-template",
		};

		try {
			editor.timeline.insertElement({
				element: {
					...base,
					animations: buildTextMotionAnimations({
						element: motionSource,
						preset,
					}),
				},
				placement: { mode: "auto" },
			});
			toast.success(
				"Motion text ditambahkan. Pilih teks untuk mengganti isinya.",
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Motion gagal dibuat",
			);
		}
	};

	return (
		<PanelView title="Text">
			<div className="space-y-5 pb-4">
				<div>
					<p className="mb-2 text-xs font-medium">Basic</p>
					<div className="w-28">
						<DraggableItem
							name="Default text"
							preview={
								<div className="bg-accent flex size-full items-center justify-center rounded">
									<span className="text-xs select-none">Default text</span>
								</div>
							}
							dragData={{
								id: "temp-text-id",
								type: DEFAULTS.text.element.type,
								name: DEFAULTS.text.element.name,
								content: "Default text",
							}}
							aspectRatio={1}
							onAddToTimeline={handleAddToTimeline}
							shouldShowLabel={false}
						/>
					</div>
				</div>

				<div>
					<div className="mb-2 flex items-end justify-between gap-2">
						<div>
							<p className="text-xs font-medium">Motion Classic</p>
							<p className="text-muted-foreground text-[11px]">
								{selectedText.length > 0
									? `${selectedText.length} teks terpilih`
									: "Klik preset untuk membuat teks"}
							</p>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2">
						{TEXT_MOTION_PRESETS.map((preset) => (
							<Button
								key={preset.id}
								variant="outline"
								className="group h-24 min-w-0 flex-col items-stretch overflow-hidden p-2 text-left"
								onClick={() => handlePreset({ preset: preset.id })}
							>
								<div className="bg-accent/60 flex h-11 items-center justify-center overflow-hidden rounded">
									<span
										className={cn(
											"text-xs font-semibold transition-all duration-500",
											preset.previewClass,
										)}
									>
										Motion
									</span>
								</div>
								<span className="truncate text-xs">{preset.label}</span>
								<span className="text-muted-foreground truncate text-[10px] font-normal">
									{preset.description}
								</span>
							</Button>
						))}
					</div>
				</div>

				{subtitles.length > 0 && (
					<div className="rounded-md border p-3">
						<p className="text-xs font-medium">Semua subtitle</p>
						<p className="text-muted-foreground mt-1 text-[11px]">
							Terapkan satu motion yang sama ke {subtitles.length} blok
							subtitle.
						</p>
						<div className="mt-2 grid grid-cols-2 gap-2">
							{TEXT_MOTION_PRESETS.map((preset) => (
								<Button
									key={preset.id}
									variant="secondary"
									size="sm"
									className="min-w-0 truncate text-xs"
									onClick={() =>
										applyPreset({ preset: preset.id, targets: subtitles })
									}
								>
									{preset.label.replace("Classic ", "")}
								</Button>
							))}
						</div>
					</div>
				)}
			</div>
		</PanelView>
	);
}
