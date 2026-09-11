import { z } from "zod";
import type { AudioCatalogV1, AudioPlanV1 } from "./contracts";

const audioLicenseSchema = z.strictObject({
	licenseId: z.string(),
	licenseName: z.string(),
	sourceUrl: z.string(),
	licenseUrl: z.string(),
	creator: z.string(),
	attributionRequired: z.boolean(),
	attributionText: z.string().nullable(),
	commercialUseAllowed: z.boolean(),
	derivativeUseAllowed: z.boolean(),
	reviewStatus: z.enum(["verified", "review-needed"]),
	reviewedAt: z.string().nullable(),
});

const audioCatalogAssetSchema = z.strictObject({
	id: z.string(),
	mediaId: z.string().nullable(),
	kind: z.enum(["music", "sound-effect", "transition"]),
	durationTicks: z.number().int(),
	license: audioLicenseSchema,
});

const audioCatalogSchema: z.ZodType<AudioCatalogV1> = z.strictObject({
	schemaVersion: z.literal("1.0"),
	catalogId: z.string(),
	revision: z.number().int().nonnegative(),
	assets: z.array(audioCatalogAssetSchema),
});

const audioDuckingSchema = z.strictObject({
	enabled: z.boolean(),
	targetGainDb: z.number(),
	attackTicks: z.number().int(),
	releaseTicks: z.number().int(),
	dialogueTrackIds: z.array(z.string()),
});

const insertCatalogAudioSchema = z.strictObject({
	type: z.literal("insert_catalog_audio"),
	operationId: z.string(),
	resultElementId: z.string(),
	catalogAssetId: z.string(),
	targetTrackId: z.string(),
	timelineStartTicks: z.number().int(),
	sourceStartTicks: z.number().int(),
	durationTicks: z.number().int(),
	gainDb: z.number(),
	fadeInTicks: z.number().int(),
	fadeOutTicks: z.number().int(),
	ducking: audioDuckingSchema.nullable(),
});

const audioPlanSchema: z.ZodType<AudioPlanV1> = z.strictObject({
	schemaVersion: z.literal("1.0"),
	planId: z.string(),
	idempotencyKey: z.string(),
	projectId: z.string(),
	baseProjectRevision: z.number().int().nonnegative(),
	baseTimelineHash: z.string(),
	catalogId: z.string(),
	catalogRevision: z.number().int().nonnegative(),
	operations: z.array(insertCatalogAudioSchema).min(1).max(200),
});

function parseJsonInput({ input }: { input: string | unknown }): unknown {
	if (typeof input !== "string") return input;
	const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	return JSON.parse((fenced ?? input).trim());
}

/** Strictly parses GPT output before Rust performs project/catalog validation. */
export function parseAudioPlanV1({
	input,
}: {
	input: string | unknown;
}): AudioPlanV1 {
	const result = audioPlanSchema.safeParse(parseJsonInput({ input }));
	if (!result.success) {
		throw new Error("JSON bukan AudioPlanV1 yang valid.", {
			cause: result.error,
		});
	}
	return result.data;
}

/** Strictly parses catalog metadata supplied to the GPT bridge and validator. */
export function parseAudioCatalogV1({
	input,
}: {
	input: string | unknown;
}): AudioCatalogV1 {
	const result = audioCatalogSchema.safeParse(parseJsonInput({ input }));
	if (!result.success) {
		throw new Error("JSON bukan AudioCatalogV1 yang valid.", {
			cause: result.error,
		});
	}
	return result.data;
}
