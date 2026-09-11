import { z } from "zod";

const httpsUrlSchema = z
	.string()
	.url()
	.refine((value) => new URL(value).protocol === "https:", {
		message: "Catalog URLs must use HTTPS",
	});

const catalogIdSchema = z
	.string()
	.trim()
	.min(1)
	.max(120)
	.regex(
		/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
		"Use lowercase letters, numbers, dots, dashes, or underscores",
	);

export const soundCatalogKindSchema = z.enum([
	"music",
	"sound-effect",
	"transition",
]);

export const soundCatalogMoodSchema = z.enum([
	"calm",
	"cinematic",
	"dramatic",
	"energetic",
	"fun",
	"hopeful",
	"inspiring",
	"mysterious",
	"neutral",
	"playful",
	"romantic",
	"sad",
	"tense",
	"uplifting",
]);

export const soundCatalogThemeSchema = z.enum([
	"business",
	"comedy",
	"documentary",
	"education",
	"fashion",
	"food",
	"gaming",
	"general",
	"health",
	"lifestyle",
	"nature",
	"news",
	"product",
	"sports",
	"technology",
	"travel",
]);

export const soundCatalogLicenseSchema = z
	.object({
		licenseId: z.string().trim().min(1).max(80),
		licenseName: z.string().trim().min(1).max(160),
		licenseUrl: httpsUrlSchema,
		sourceUrl: httpsUrlSchema,
		creator: z.string().trim().min(1).max(160),
		attributionRequired: z.boolean(),
		attributionText: z.string().trim().min(1).max(1000).optional(),
		commercialUseAllowed: z.boolean(),
		derivativeUseAllowed: z.boolean(),
		reviewStatus: z.enum(["verified", "review-needed"]),
		reviewedAt: z.string().datetime({ offset: true }).optional(),
	})
	.superRefine((license, context) => {
		if (license.attributionRequired && !license.attributionText) {
			context.addIssue({
				code: "custom",
				path: ["attributionText"],
				message: "Attribution text is required by this license",
			});
		}

		if (license.reviewStatus === "verified" && !license.reviewedAt) {
			context.addIssue({
				code: "custom",
				path: ["reviewedAt"],
				message: "Verified licenses must include a review timestamp",
			});
		}
	});

export const soundCatalogMediaSchema = z
	.object({
		previewUrl: httpsUrlSchema.optional(),
		downloadUrl: httpsUrlSchema.optional(),
		bundledPath: z
			.string()
			.regex(/^\/sounds\/catalog\/[a-zA-Z0-9._/-]+$/)
			.refine((value) => !value.includes(".."), {
				message: "Bundled paths may not traverse directories",
			})
			.optional(),
		mimeType: z.enum(["audio/mpeg", "audio/ogg", "audio/wav", "audio/webm"]),
		sha256: z
			.string()
			.regex(/^sha256:[a-f0-9]{64}$/)
			.optional(),
		bytes: z.number().int().positive().optional(),
	})
	.superRefine((media, context) => {
		if (!media.previewUrl && !media.downloadUrl && !media.bundledPath) {
			context.addIssue({
				code: "custom",
				message:
					"Catalog media must provide a preview, download, or bundled path",
			});
		}

		if (media.downloadUrl && !media.sha256) {
			context.addIssue({
				code: "custom",
				path: ["sha256"],
				message: "Remote downloads require a SHA-256 checksum",
			});
		}
	});

export const soundCatalogEntrySchema = z.object({
	id: catalogIdSchema,
	title: z.string().trim().min(1).max(200),
	description: z.string().trim().max(1000).default(""),
	kind: soundCatalogKindSchema,
	durationSeconds: z.number().positive().max(21_600),
	bpm: z.number().int().min(20).max(300).optional(),
	moods: z.array(soundCatalogMoodSchema).min(1).max(8),
	themes: z.array(soundCatalogThemeSchema).min(1).max(12),
	tags: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
	license: soundCatalogLicenseSchema,
	media: soundCatalogMediaSchema,
});

export const soundCatalogManifestSchema = z
	.object({
		schemaVersion: z.literal("1.0"),
		catalogId: catalogIdSchema,
		name: z.string().trim().min(1).max(160),
		updatedAt: z.string().datetime({ offset: true }),
		entries: z.array(soundCatalogEntrySchema),
	})
	.superRefine((manifest, context) => {
		const seenIds = new Set<string>();
		for (const [index, entry] of manifest.entries.entries()) {
			if (seenIds.has(entry.id)) {
				context.addIssue({
					code: "custom",
					path: ["entries", index, "id"],
					message: `Duplicate catalog entry id: ${entry.id}`,
				});
			}
			seenIds.add(entry.id);
		}
	});

export type SoundCatalogKind = z.infer<typeof soundCatalogKindSchema>;
export type SoundCatalogMood = z.infer<typeof soundCatalogMoodSchema>;
export type SoundCatalogTheme = z.infer<typeof soundCatalogThemeSchema>;
export type SoundCatalogLicense = z.infer<typeof soundCatalogLicenseSchema>;
export type SoundCatalogMedia = z.infer<typeof soundCatalogMediaSchema>;
export type SoundCatalogEntry = z.infer<typeof soundCatalogEntrySchema>;
export type SoundCatalogManifest = z.infer<typeof soundCatalogManifestSchema>;
