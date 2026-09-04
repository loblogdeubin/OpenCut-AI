"use client";

import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { mediaTimeFromSeconds } from "@/wasm";
import { toast } from "sonner";

type TransitionPreset =
	| "fade-in"
	| "fade-out"
	| "slide-in-right"
	| "slide-out-left"
	| "zoom-in";

const PRESETS: Array<{
	id: TransitionPreset;
	label: string;
	description: string;
}> = [
	{ id: "fade-in", label: "Fade In", description: "Muncul perlahan" },
	{ id: "fade-out", label: "Fade Out", description: "Hilang perlahan" },
	{ id: "slide-in-right", label: "Slide In", description: "Masuk dari kanan" },
	{ id: "slide-out-left", label: "Slide Out", description: "Keluar ke kiri" },
	{ id: "zoom-in", label: "Zoom In", description: "Masuk dengan zoom" },
];

export function TransitionsView() {
	const editor = useEditor();
	const selected = useEditor((currentEditor) =>
		currentEditor.selection.getSelectedElements(),
	);

	const applyPreset = ({ preset }: { preset: TransitionPreset }) => {
		const target = editor.timeline.getElementsWithTracks({
			elements: selected,
		})[0];
		if (
			!target ||
			(target.element.type !== "video" && target.element.type !== "image")
		) {
			toast.error("Pilih satu video atau gambar terlebih dahulu");
			return;
		}

		const duration = Math.min(
			target.element.duration / 2,
			mediaTimeFromSeconds({ seconds: 0.5 }),
		);
		const end = target.element.duration;
		const startOfOutro = Math.max(0, end - duration);
		const keyframes = (() => {
			switch (preset) {
				case "fade-in":
					return [
						{ propertyPath: "opacity", time: 0, value: 0 },
						{ propertyPath: "opacity", time: duration, value: 1 },
					];
				case "fade-out":
					return [
						{ propertyPath: "opacity", time: startOfOutro, value: 1 },
						{ propertyPath: "opacity", time: end, value: 0 },
					];
				case "slide-in-right":
					return [
						{ propertyPath: "transform.positionX", time: 0, value: 1200 },
						{ propertyPath: "transform.positionX", time: duration, value: 0 },
					];
				case "slide-out-left":
					return [
						{
							propertyPath: "transform.positionX",
							time: startOfOutro,
							value: 0,
						},
						{ propertyPath: "transform.positionX", time: end, value: -1200 },
					];
				case "zoom-in":
					return [
						{ propertyPath: "transform.scaleX", time: 0, value: 0.82 },
						{ propertyPath: "transform.scaleX", time: duration, value: 1 },
						{ propertyPath: "transform.scaleY", time: 0, value: 0.82 },
						{ propertyPath: "transform.scaleY", time: duration, value: 1 },
					];
			}
		})();

		editor.timeline.upsertKeyframes({
			keyframes: keyframes.map((keyframe) => ({
				trackId: target.track.id,
				elementId: target.element.id,
				...keyframe,
				interpolation: "bezier" as const,
			})),
		});
		toast.success("Transisi diterapkan ke clip terpilih");
	};

	return (
		<PanelView title="Transitions">
			<p className="text-muted-foreground mb-4 text-xs">
				Pilih video atau gambar, lalu terapkan transisi. Untuk crossfade, tumpuk
				dua clip dan beri Fade Out pada clip pertama serta Fade In pada clip
				kedua.
			</p>
			<div className="grid grid-cols-2 gap-2">
				{PRESETS.map((preset) => (
					<Button
						key={preset.id}
						variant="outline"
						className="h-auto flex-col items-start gap-1 p-3 text-left"
						onClick={() => applyPreset({ preset: preset.id })}
					>
						<span>{preset.label}</span>
						<span className="text-muted-foreground text-xs font-normal">
							{preset.description}
						</span>
					</Button>
				))}
			</div>
		</PanelView>
	);
}
