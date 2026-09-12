"use client";
import { useRef, useState } from "react";
import type { ImageElement } from "@/timeline";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/section";
import { processMediaAssets } from "@/media/processing";
import { removeImageBackgroundLocally } from "../local-background-remover";

export function BackgroundRemovalTab({
	element,
	trackId,
}: {
	element: ImageElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [progress, setProgress] = useState<number | null>(null);
	const [message, setMessage] = useState("");
	const controller = useRef<AbortController | null>(null);
	const run = async () => {
		const asset = editor.media
			.getAssets()
			.find((item) => item.id === element.mediaId);
		if (!asset) return;
		controller.current = new AbortController();
		setProgress(0);
		setMessage("");
		try {
			const file = await removeImageBackgroundLocally({
				file: asset.file,
				signal: controller.current.signal,
				onProgress: setProgress,
			});
			const processed = (await processMediaAssets({ files: [file] }))[0];
			if (!processed) throw new Error("Could not import the processed image.");
			const added = await editor.media.addMediaAsset({
				projectId: editor.project.getActive().metadata.id,
				asset: processed,
			});
			if (!added) throw new Error("Could not save the processed image.");
			editor.timeline.updateElements({
				updates: [
					{ trackId, elementId: element.id, patch: { mediaId: added.id } },
				],
			});
			setMessage("Background removed. Original media is preserved.");
		} catch (error) {
			if ((error as Error).name !== "AbortError")
				setMessage((error as Error).message);
		} finally {
			setProgress(null);
		}
	};
	return (
		<div className="flex flex-col gap-3 p-3.5">
			<SectionTitle>Remove Background</SectionTitle>
			<p className="text-xs text-muted-foreground">
				Removes a photo background locally without a green screen. The RMBG
				model downloads once and is cached by the browser.
			</p>
			{progress === null ? (
				<Button onClick={run}>Remove background</Button>
			) : (
				<>
					<div className="h-1.5 rounded bg-muted">
						<div
							className="h-full rounded bg-primary"
							style={{ width: `${progress * 100}%` }}
						/>
					</div>
					<Button
						variant="secondary"
						onClick={() => controller.current?.abort()}
					>
						Cancel
					</Button>
				</>
			)}
			{message && <p className="text-xs">{message}</p>}
		</div>
	);
}

