export const EDIT_PLAN_SCHEMA_VERSION = "1.0" as const;
export const PROJECT_CONTENT_SCHEMA_VERSION = "1.0" as const;

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface ProjectSnapshotV1 {
	schemaVersion: typeof PROJECT_CONTENT_SCHEMA_VERSION;
	projectId: string;
	revision: number;
	content: ProjectContentV1;
}

export interface ProjectContentV1 {
	schemaVersion: typeof PROJECT_CONTENT_SCHEMA_VERSION;
	currentSceneId: string;
	settings: OutputSettingsV1;
	scenes: SceneV1[];
	media: MediaAssetV1[];
}

export interface OutputSettingsV1 {
	fpsNumerator: number;
	fpsDenominator: number;
	canvasWidth: number;
	canvasHeight: number;
	background: Record<string, JsonValue>;
}

export interface SceneV1 {
	id: string;
	isMain: boolean;
	tracks: TrackV1[];
	bookmarks: BookmarkV1[];
}

export interface BookmarkV1 {
	timeTicks: number;
	durationTicks: number | null;
	note: string | null;
	color: string | null;
}

export type TrackKindV1 = "video" | "text" | "audio" | "graphic" | "effect";
export type ElementKindV1 =
	| "video"
	| "image"
	| "audio"
	| "text"
	| "sticker"
	| "graphic"
	| "effect";

export interface TrackV1 {
	id: string;
	kind: TrackKindV1;
	muted: boolean | null;
	hidden: boolean | null;
	elements: ElementV1[];
}

export interface ElementV1 {
	id: string;
	kind: ElementKindV1;
	mediaId: string | null;
	startTicks: number;
	durationTicks: number;
	trimStartTicks: number;
	trimEndTicks: number;
	sourceDurationTicks: number | null;
	semanticData: Record<string, JsonValue>;
}

export interface MediaAssetV1 {
	id: string;
	kind: "video" | "image" | "audio";
	durationTicks: number | null;
	checksum: string | null;
}

export interface ElementRefV1 {
	trackId: string;
	elementId: string;
}

export interface ElementMoveV1 {
	element: ElementRefV1;
	targetTrackId: string;
	timelineStartTicks: number;
}

export interface SplitTargetV1 {
	element: ElementRefV1;
	leftResultElementId: string | null;
	rightResultElementId: string | null;
}

export type EditOperationV1 =
	| {
			type: "insert_segment";
			operationId: string;
			resultElementId: string;
			mediaId: string;
			targetTrackId: string;
			sourceStartTicks: number;
			sourceEndTicks: number;
			timelineStartTicks: number;
	  }
	| {
			type: "split_elements";
			operationId: string;
			targets: SplitTargetV1[];
			splitTimeTicks: number;
			retainSide: "both" | "left" | "right";
	  }
	| {
			type: "trim_element";
			operationId: string;
			element: ElementRefV1;
			trimStartTicks: number;
			trimEndTicks: number;
			timelineStartTicks: number;
			durationTicks: number;
	  }
	| {
			type: "delete_elements";
			operationId: string;
			elements: ElementRefV1[];
	  }
	| {
			type: "move_elements";
			operationId: string;
			moves: ElementMoveV1[];
	  }
	| {
			type: "update_output_settings";
			operationId: string;
			canvasWidth?: number;
			canvasHeight?: number;
			fpsNumerator?: number;
			fpsDenominator?: number;
	  };

export interface EditPlanV1 {
	schemaVersion: typeof EDIT_PLAN_SCHEMA_VERSION;
	planId: string;
	idempotencyKey: string;
	projectId: string;
	baseProjectRevision: number;
	baseTimelineHash: string;
	operations: EditOperationV1[];
}

export interface ValidationErrorV1 {
	code: string;
	message: string;
	operationId: string | null;
}

export interface ValidationResultV1 {
	valid: boolean;
	currentTimelineHash: string;
	errors: ValidationErrorV1[];
	warnings: string[];
}

export interface AudibleRangeV1 {
	startTicks: number;
	endTicks: number;
}

export interface DetectAudibleRangesV1Options {
	amplitudes: number[];
	sampleRate: number;
	bucketSize: number;
	totalDurationTicks: number;
	ticksPerSecond: number;
	threshold: number;
	minSilenceTicks: number;
	paddingTicks: number;
	minSegmentTicks: number;
}
