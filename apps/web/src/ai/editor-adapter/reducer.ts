import { splitAnimationsAtTime } from "@/animation";
import type { MediaAsset } from "@/media/types";
import type { TProject, TProjectSettings } from "@/project/types";
import { getSourceSpanAtClipTime } from "@/retime";
import {
	buildElementFromMedia,
	findTrackInSceneTracks,
	type SceneTracks,
	type TimelineElement,
	type TimelineTrack,
	type TScene,
} from "@/timeline";
import {
	addMediaTime,
	mediaTime,
	mediaTimeFromSeconds,
	roundMediaTime,
	subMediaTime,
} from "@/wasm";
import type {
	EditOperationV1,
	EditPlanV1,
	ElementMoveV1,
	ElementRefV1,
	SplitTargetV1,
} from "./contracts";

export interface ReducedEditableState {
	scenes: TScene[];
	currentSceneId: string;
	settings: TProjectSettings;
}

function mapTracks({
	tracks,
	update,
}: {
	tracks: SceneTracks;
	update: (track: TimelineTrack) => TimelineTrack;
}): SceneTracks {
	return {
		main: update(tracks.main) as SceneTracks["main"],
		overlay: tracks.overlay.map(update) as SceneTracks["overlay"],
		audio: tracks.audio.map(update) as SceneTracks["audio"],
	};
}

function updateTrack({
	scenes,
	trackId,
	update,
}: {
	scenes: TScene[];
	trackId: string;
	update: (track: TimelineTrack) => TimelineTrack;
}): TScene[] {
	let found = false;
	const nextScenes = scenes.map((scene) => {
		const track = findTrackInSceneTracks({ tracks: scene.tracks, trackId });
		if (!track) return scene;
		found = true;
		return {
			...scene,
			tracks: mapTracks({
				tracks: scene.tracks,
				update: (candidate) =>
					candidate.id === trackId ? update(candidate) : candidate,
			}),
			updatedAt: new Date(),
		};
	});
	if (!found) throw new Error(`Track ${trackId} does not exist`);
	return nextScenes;
}

function getElement({ scenes, ref }: { scenes: TScene[]; ref: ElementRefV1 }): {
	track: TimelineTrack;
	element: TimelineElement;
} {
	for (const scene of scenes) {
		const track = findTrackInSceneTracks({
			tracks: scene.tracks,
			trackId: ref.trackId,
		});
		const element = track?.elements.find(
			(candidate) => candidate.id === ref.elementId,
		);
		if (track && element) return { track, element };
	}
	throw new Error(`Element ${ref.trackId}/${ref.elementId} does not exist`);
}

function replaceElement({
	scenes,
	ref,
	replacements,
}: {
	scenes: TScene[];
	ref: ElementRefV1;
	replacements: TimelineElement[];
}): TScene[] {
	getElement({ scenes, ref });
	return updateTrack({
		scenes,
		trackId: ref.trackId,
		update: (track) =>
			({
				...track,
				elements: track.elements.flatMap((element) =>
					element.id === ref.elementId ? replacements : [element],
				),
			}) as TimelineTrack,
	});
}

function applyInsert({
	scenes,
	mediaAssets,
	operation,
}: {
	scenes: TScene[];
	mediaAssets: MediaAsset[];
	operation: Extract<EditOperationV1, { type: "insert_segment" }>;
}): TScene[] {
	const asset = mediaAssets.find(
		(candidate) => candidate.id === operation.mediaId,
	);
	if (!asset) throw new Error(`Media ${operation.mediaId} does not exist`);
	const visibleDuration = mediaTime({
		ticks: operation.sourceEndTicks - operation.sourceStartTicks,
	});
	const sourceDuration =
		asset.duration === undefined
			? visibleDuration
			: mediaTimeFromSeconds({ seconds: asset.duration });
	const built = buildElementFromMedia({
		mediaId: asset.id,
		mediaType: asset.type,
		name: asset.name,
		duration: visibleDuration,
		startTime: mediaTime({ ticks: operation.timelineStartTicks }),
	});
	const element = {
		...built,
		id: operation.resultElementId,
		trimStart: mediaTime({ ticks: operation.sourceStartTicks }),
		trimEnd: mediaTime({
			ticks: Math.max(0, sourceDuration - operation.sourceEndTicks),
		}),
		sourceDuration,
	} as TimelineElement;

	return updateTrack({
		scenes,
		trackId: operation.targetTrackId,
		update: (track) =>
			({
				...track,
				elements: [...track.elements, element],
			}) as TimelineTrack,
	});
}

function splitElement({
	element,
	target,
	splitTimeTicks,
	retainSide,
}: {
	element: TimelineElement;
	target: SplitTargetV1;
	splitTimeTicks: number;
	retainSide: "both" | "left" | "right";
}): TimelineElement[] {
	const splitTime = mediaTime({ ticks: splitTimeTicks });
	const relativeTime = subMediaTime({ a: splitTime, b: element.startTime });
	const rightVisibleDuration = subMediaTime({
		a: element.duration,
		b: relativeTime,
	});
	const retime = "retime" in element ? element.retime : undefined;
	const leftSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({ clipTime: relativeTime, retime }),
	});
	const totalSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({ clipTime: element.duration, retime }),
	});
	const rightSourceSpan = subMediaTime({
		a: totalSourceSpan,
		b: leftSourceSpan,
	});
	const { leftAnimations, rightAnimations } = splitAnimationsAtTime({
		animations: element.animations,
		splitTime: relativeTime,
		shouldIncludeSplitBoundary: true,
	});
	const left: TimelineElement = {
		...element,
		id: target.leftResultElementId ?? element.id,
		duration: relativeTime,
		trimEnd: addMediaTime({ a: element.trimEnd, b: rightSourceSpan }),
		animations: leftAnimations,
		name: `${element.name} (left)`,
	};
	const right: TimelineElement = {
		...element,
		id: target.rightResultElementId ?? element.id,
		startTime: splitTime,
		duration: rightVisibleDuration,
		trimStart: addMediaTime({ a: element.trimStart, b: leftSourceSpan }),
		animations: rightAnimations,
		name: `${element.name} (right)`,
	};
	if (retainSide === "left") return [left];
	if (retainSide === "right") return [right];
	return [left, right];
}

function applySplit({
	scenes,
	operation,
}: {
	scenes: TScene[];
	operation: Extract<EditOperationV1, { type: "split_elements" }>;
}): TScene[] {
	let nextScenes = scenes;
	for (const target of operation.targets) {
		const { element } = getElement({ scenes: nextScenes, ref: target.element });
		nextScenes = replaceElement({
			scenes: nextScenes,
			ref: target.element,
			replacements: splitElement({
				element,
				target,
				splitTimeTicks: operation.splitTimeTicks,
				retainSide: operation.retainSide,
			}),
		});
	}
	return nextScenes;
}

function applyMove({
	scenes,
	moves,
}: {
	scenes: TScene[];
	moves: ElementMoveV1[];
}): TScene[] {
	const moved = moves.map((move) => ({
		move,
		element: {
			...getElement({ scenes, ref: move.element }).element,
			startTime: mediaTime({ ticks: move.timelineStartTicks }),
		} as TimelineElement,
	}));
	const ids = new Set(moved.map(({ element }) => element.id));
	let nextScenes = scenes.map((scene) => ({
		...scene,
		tracks: mapTracks({
			tracks: scene.tracks,
			update: (track) =>
				({
					...track,
					elements: track.elements.filter((element) => !ids.has(element.id)),
				}) as TimelineTrack,
		}),
	}));
	for (const { move, element } of moved) {
		nextScenes = updateTrack({
			scenes: nextScenes,
			trackId: move.targetTrackId,
			update: (track) =>
				({
					...track,
					elements: [...track.elements, element],
				}) as TimelineTrack,
		});
	}
	return nextScenes;
}

function applyOperation({
	state,
	mediaAssets,
	operation,
}: {
	state: ReducedEditableState;
	mediaAssets: MediaAsset[];
	operation: EditOperationV1;
}): ReducedEditableState {
	switch (operation.type) {
		case "insert_segment":
			return {
				...state,
				scenes: applyInsert({ scenes: state.scenes, mediaAssets, operation }),
			};
		case "split_elements":
			return {
				...state,
				scenes: applySplit({ scenes: state.scenes, operation }),
			};
		case "trim_element": {
			const { element } = getElement({
				scenes: state.scenes,
				ref: operation.element,
			});
			return {
				...state,
				scenes: replaceElement({
					scenes: state.scenes,
					ref: operation.element,
					replacements: [
						{
							...element,
							trimStart: mediaTime({ ticks: operation.trimStartTicks }),
							trimEnd: mediaTime({ ticks: operation.trimEndTicks }),
							startTime: mediaTime({ ticks: operation.timelineStartTicks }),
							duration: mediaTime({ ticks: operation.durationTicks }),
						},
					],
				}),
			};
		}
		case "delete_elements": {
			let scenes = state.scenes;
			for (const ref of operation.elements) {
				scenes = replaceElement({ scenes, ref, replacements: [] });
			}
			return { ...state, scenes };
		}
		case "move_elements":
			return {
				...state,
				scenes: applyMove({ scenes: state.scenes, moves: operation.moves }),
			};
		case "update_output_settings":
			return {
				...state,
				settings: {
					...state.settings,
					canvasSize: {
						width: operation.canvasWidth ?? state.settings.canvasSize.width,
						height: operation.canvasHeight ?? state.settings.canvasSize.height,
					},
					fps: {
						numerator: operation.fpsNumerator ?? state.settings.fps.numerator,
						denominator:
							operation.fpsDenominator ?? state.settings.fps.denominator,
					},
				},
			};
	}
}

export function reduceEditPlan({
	project,
	mediaAssets,
	plan,
}: {
	project: TProject;
	mediaAssets: MediaAsset[];
	plan: EditPlanV1;
}): ReducedEditableState {
	let state: ReducedEditableState = {
		scenes: project.scenes,
		currentSceneId: project.currentSceneId,
		settings: project.settings,
	};
	for (const operation of plan.operations) {
		state = applyOperation({ state, mediaAssets, operation });
	}
	return state;
}
