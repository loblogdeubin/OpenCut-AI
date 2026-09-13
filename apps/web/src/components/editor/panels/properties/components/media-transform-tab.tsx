"use client";

import { getElementKeyframes } from "@/animation";
import { resolveTransformAtTime } from "@/rendering/animation-values";
import { buildTransformFromParams } from "@/rendering";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { useEditor } from "@/editor/use-editor";
import type { MediaAsset } from "@/media/types";
import type { RectangleMask } from "@/masks/types";
import {
	getAspectCropFractions,
	getFramingScale,
} from "@/rendering/crop-presets";
import type { ImageElement, VideoElement } from "@/timeline";
import { ElementParamsTab } from "./element-params-tab";
import { addMediaTime, mediaTime } from "@/wasm";

const CROP_MASK_PREFIX = "opencut-crop:";
const TRANSFORM_KEYS = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
] as const;

export function MediaTransformTab({
	element,
	trackId,
	mediaAsset,
}: {
	element: VideoElement | ImageElement;
	trackId: string;
	mediaAsset?: MediaAsset;
}) {
	const editor = useEditor();
	const canvasSize = useEditor(
		(core) => core.project.getActive().settings.canvasSize,
	);
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const baseTransform = buildTransformFromParams({ params: element.params });
	const resolved = resolveTransformAtTime({
		baseTransform,
		animations: element.animations,
		localTime,
	});
	const validMedia = Boolean(mediaAsset?.width && mediaAsset?.height);
	const update = (patch: Partial<VideoElement | ImageElement>) =>
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch }],
		});
	const frame = (mode: "fit" | "fill" | "original") => {
		if (!mediaAsset?.width || !mediaAsset.height) return;
		const scale = getFramingScale({
			mode,
			canvasSize,
			sourceSize: { width: mediaAsset.width, height: mediaAsset.height },
		});
		update({
			params: {
				...element.params,
				"transform.positionX": 0,
				"transform.positionY": 0,
				"transform.scaleX": scale,
				"transform.scaleY": scale,
			},
		});
	};
	const crop = (targetAspect: number) => {
		if (!mediaAsset?.width || !mediaAsset.height) return;
		const fractions = getAspectCropFractions({
			sourceAspect: mediaAsset.width / mediaAsset.height,
			targetAspect,
		});
		const mask: RectangleMask = {
			id: `${CROP_MASK_PREFIX}${element.id}`,
			type: "rectangle",
			params: {
				centerX: 0,
				centerY: 0,
				width: fractions.width,
				height: fractions.height,
				rotation: 0,
				scale: 1,
				feather: 0,
				inverted: false,
				strokeColor: "#ffffff",
				strokeWidth: 0,
				strokeAlign: "center",
			},
		};
		update({
			masks: [
				...(element.masks ?? []).filter(
					(item) => !item.id.startsWith(CROP_MASK_PREFIX),
				),
				mask,
			],
		});
	};
	const resetCrop = () =>
		update({
			masks: (element.masks ?? []).filter(
				(item) => !item.id.startsWith(CROP_MASK_PREFIX),
			),
		});
	const cropMask = element.masks?.find(
		(item): item is RectangleMask =>
			item.id.startsWith(CROP_MASK_PREFIX) && item.type === "rectangle",
	);
	const updateCustomCrop = ({
		key,
		value,
	}: {
		key: "centerX" | "centerY" | "width" | "height";
		value: number;
	}) => {
		const mask: RectangleMask = {
			id: `${CROP_MASK_PREFIX}${element.id}`,
			type: "rectangle",
			params: {
				centerX: 0,
				centerY: 0,
				width: 1,
				height: 1,
				rotation: 0,
				scale: 1,
				feather: 0,
				inverted: false,
				strokeColor: "#ffffff",
				strokeWidth: 0,
				strokeAlign: "center",
				...(cropMask?.params ?? {}),
				[key]: value,
			},
		};
		update({
			masks: [
				...(element.masks ?? []).filter(
					(item) => !item.id.startsWith(CROP_MASK_PREFIX),
				),
				mask,
			],
		});
	};
	const times = [
		...new Set(
			getElementKeyframes({ animations: element.animations }).map(
				(key) => key.time,
			),
		),
	].sort((a, b) => a - b);
	const seek = (direction: -1 | 1) => {
		const target =
			direction < 0
				? times.filter((time) => time < localTime - 1).at(-1)
				: times.find((time) => time > localTime + 1);
		if (target != null)
			editor.playback.seek({
				time: addMediaTime({
					a: element.startTime,
					b: mediaTime({ ticks: target }),
				}),
			});
	};
	const add = () => {
		if (!isPlayheadWithinElementRange) return;
		editor.timeline.upsertKeyframes({
			keyframes: [
				{
					trackId,
					elementId: element.id,
					propertyPath: "transform.positionX",
					time: localTime,
					value: resolved.position.x,
				},
				{
					trackId,
					elementId: element.id,
					propertyPath: "transform.positionY",
					time: localTime,
					value: resolved.position.y,
				},
				{
					trackId,
					elementId: element.id,
					propertyPath: "transform.scaleX",
					time: localTime,
					value: resolved.scaleX,
				},
				{
					trackId,
					elementId: element.id,
					propertyPath: "transform.scaleY",
					time: localTime,
					value: resolved.scaleY,
				},
				{
					trackId,
					elementId: element.id,
					propertyPath: "transform.rotate",
					time: localTime,
					value: resolved.rotate,
				},
			],
		});
	};

	return (
		<>
			{validMedia && (
				<Section sectionKey={`${element.id}:framing`}>
					<SectionContent className="pt-4">
						<SectionFields>
							<SectionField label="Framing (no distortion)">
								<div className="grid grid-cols-3 gap-1">
									{(["fit", "fill", "original"] as const).map((mode) => (
										<Button
											key={mode}
											size="sm"
											variant="outline"
											className="capitalize"
											onClick={() => frame(mode)}
										>
											{mode}
										</Button>
									))}
								</div>
							</SectionField>
							<SectionField label="Crop aspect">
								<div className="grid grid-cols-5 gap-1">
									{[
										["9:16", 9 / 16],
										["16:9", 16 / 9],
										["1:1", 1],
										["4:5", 4 / 5],
									].map(([label, ratio]) => (
										<Button
											key={label}
											size="sm"
											variant="ghost"
											onClick={() => crop(ratio as number)}
										>
											{label}
										</Button>
									))}
									<Button size="sm" variant="ghost" onClick={resetCrop}>
										Reset
									</Button>
								</div>
							</SectionField>
							<SectionField label="Custom crop">
								<div className="space-y-2">
									<CustomCropSlider
										label="Horizontal"
										value={cropMask?.params.centerX ?? 0}
										min={-0.5}
										max={0.5}
										onChange={(value) =>
											updateCustomCrop({ key: "centerX", value })
										}
									/>
									<CustomCropSlider
										label="Vertical"
										value={cropMask?.params.centerY ?? 0}
										min={-0.5}
										max={0.5}
										onChange={(value) =>
											updateCustomCrop({ key: "centerY", value })
										}
									/>
									<CustomCropSlider
										label="Width"
										value={cropMask?.params.width ?? 1}
										min={0.05}
										max={1}
										onChange={(value) =>
											updateCustomCrop({ key: "width", value })
										}
									/>
									<CustomCropSlider
										label="Height"
										value={cropMask?.params.height ?? 1}
										min={0.05}
										max={1}
										onChange={(value) =>
											updateCustomCrop({ key: "height", value })
										}
									/>
									<p className="text-[11px] text-muted-foreground">
										Atur area bebas di sini, atau buka tab Masks untuk menarik
										sisi dan sudut crop langsung pada preview.
									</p>
								</div>
							</SectionField>
							<SectionField label="Keyframes">
								<div className="grid grid-cols-3 gap-1">
									<Button size="sm" variant="outline" onClick={() => seek(-1)}>
										Previous
									</Button>
									<Button size="sm" variant="secondary" onClick={add}>
										Add
									</Button>
									<Button size="sm" variant="outline" onClick={() => seek(1)}>
										Next
									</Button>
								</div>
							</SectionField>
						</SectionFields>
					</SectionContent>
				</Section>
			)}
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={TRANSFORM_KEYS}
				sectionKey="transform"
			/>
		</>
	);
}

function CustomCropSlider({
	label,
	value,
	min,
	max,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className="grid grid-cols-[72px_1fr_38px] items-center gap-2 text-xs">
			<span>{label}</span>
			<input
				type="range"
				min={min}
				max={max}
				step={0.01}
				value={value}
				onChange={(event) => onChange(Number(event.currentTarget.value))}
			/>
			<span className="text-right tabular-nums text-muted-foreground">
				{Math.round(value * 100)}%
			</span>
		</label>
	);
}
