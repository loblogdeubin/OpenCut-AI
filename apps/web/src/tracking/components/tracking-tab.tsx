"use client";
import { useRef, useState } from "react";
import type { VideoElement } from "@/timeline";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SectionTitle } from "@/components/section";
import { trackFaceLocally, trackSubjectLocally } from "../local-face-tracker";
import { buildAutoReframeKeyframes } from "../auto-reframe";
import { buildTransformFromParams } from "@/rendering";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";

export function TrackingTab({
	element,
	trackId,
}: {
	element: VideoElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [mode, setMode] = useState("face");
	const [progress, setProgress] = useState<number | null>(null);
	const [message, setMessage] = useState("");
	const [autoReframe, setAutoReframe] = useState(true);
	const controller = useRef<AbortController | null>(null);
	const run = async () => {
		const asset = editor.media
			.getAssets()
			.find((item) => item.id === element.mediaId);
		if (!asset) return;
		controller.current = new AbortController();
		setMessage("");
		setProgress(0);
		try {
			const common = {
				file: asset.file,
				duration: mediaTimeToSeconds({ time: element.duration }),
				signal: controller.current.signal,
				onProgress: setProgress,
			};
			const points =
				mode === "face"
					? await trackFaceLocally(common)
					: await trackSubjectLocally({
							...common,
							subject: mode as "person" | "object",
						});
			if (points.length < 2)
				throw new Error("No continuous face track was found.");
			const sourceSize = {
				width: asset.width ?? 0,
				height: asset.height ?? 0,
			};
			if (sourceSize.width <= 0 || sourceSize.height <= 0)
				throw new Error("Video dimensions are unavailable.");
			const reframe = buildAutoReframeKeyframes({
				points,
				sourceSize,
				canvasSize: editor.project.getActive().settings.canvasSize,
				basePosition: buildTransformFromParams({ params: element.params }).position,
			});
			editor.timeline.upsertKeyframes({
				keyframes: reframe.flatMap((point) => [
					{
						trackId,
						elementId: element.id,
						propertyPath: "transform.positionX" as const,
						time: mediaTimeFromSeconds({ seconds: point.time }),
						value: point.positionX,
						interpolation: "linear" as const,
					},
					{
						trackId,
						elementId: element.id,
						propertyPath: "transform.positionY" as const,
						time: mediaTimeFromSeconds({ seconds: point.time }),
						value: point.positionY,
						interpolation: "linear" as const,
					},
					...(autoReframe
						? [
								{
									trackId,
									elementId: element.id,
									propertyPath: "transform.scaleX" as const,
									time: mediaTimeFromSeconds({ seconds: point.time }),
									value: point.scale,
									interpolation: "linear" as const,
								},
								{
									trackId,
									elementId: element.id,
									propertyPath: "transform.scaleY" as const,
									time: mediaTimeFromSeconds({ seconds: point.time }),
									value: point.scale,
									interpolation: "linear" as const,
								},
							]
						: []),
				]),
			});
			setMessage(
				`${points.length} tracking keyframes created${autoReframe ? " with proportional Auto Reframe" : ""}.`,
			);
		} catch (error) {
			if ((error as Error).name !== "AbortError")
				setMessage((error as Error).message);
		} finally {
			setProgress(null);
		}
	};
	return (
		<div className="flex flex-col gap-3 p-3.5">
			<SectionTitle>Auto Tracking</SectionTitle>
			<Select value={mode} onValueChange={setMode}>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="face">Face (local)</SelectItem>
					<SelectItem value="person">Person</SelectItem>
					<SelectItem value="object">Selected object</SelectItem>
				</SelectContent>
			</Select>
			<p className="text-xs text-muted-foreground">
				Tracking runs locally and writes editable position keyframes.
				Person/object downloads DETR once, then uses the browser model cache.
			</p>
			<label className="flex items-center gap-2 text-xs">
				<input
					type="checkbox"
					checked={autoReframe}
					onChange={(event) => setAutoReframe(event.target.checked)}
				/>
				Auto Reframe: fill canvas and follow subject without distortion
			</label>
			{progress === null ? (
				<Button onClick={run}>Analyze clip</Button>
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
