import {
	soundCatalogManifestSchema,
	type SoundCatalogEntry,
	type SoundCatalogKind,
	type SoundCatalogManifest,
	type SoundCatalogMood,
	type SoundCatalogTheme,
} from "./catalog-types";

export interface SoundCatalogFilter {
	query?: string;
	kinds?: SoundCatalogKind[];
	moods?: SoundCatalogMood[];
	themes?: SoundCatalogTheme[];
	tags?: string[];
	tagMatch?: "all" | "any";
	minimumBpm?: number;
	maximumBpm?: number;
	maximumDurationSeconds?: number;
	commercialUseOnly?: boolean;
	includeReviewNeeded?: boolean;
}

function normalize({ value }: { value: string }): string {
	return value.trim().toLocaleLowerCase("en-US");
}

function includesAny({
	values,
	requested,
}: {
	values: readonly string[];
	requested: readonly string[];
}): boolean {
	if (requested.length === 0) return true;
	const normalizedValues = new Set(values.map((value) => normalize({ value })));
	return requested.some((value) => normalizedValues.has(normalize({ value })));
}

function matchesTags({
	entryTags,
	requestedTags,
	match,
}: {
	entryTags: readonly string[];
	requestedTags: readonly string[];
	match: "all" | "any";
}): boolean {
	if (requestedTags.length === 0) return true;
	const normalizedTags = new Set(
		entryTags.map((tag) => normalize({ value: tag })),
	);
	const predicate = (tag: string) =>
		normalizedTags.has(normalize({ value: tag }));
	return match === "all"
		? requestedTags.every(predicate)
		: requestedTags.some(predicate);
}

function matchesText({
	entry,
	query,
}: {
	entry: SoundCatalogEntry;
	query: string;
}): boolean {
	const tokens = normalize({ value: query }).split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return true;

	const searchableText = normalize({
		value: [
			entry.title,
			entry.description,
			entry.license.creator,
			...entry.tags,
			...entry.moods,
			...entry.themes,
		].join(" "),
	});

	return tokens.every((token) => searchableText.includes(token));
}

export function parseSoundCatalog({
	manifest,
}: {
	manifest: unknown;
}): SoundCatalogManifest {
	return soundCatalogManifestSchema.parse(manifest);
}

export function isSoundCatalogEntrySafeForEditing({
	entry,
}: {
	entry: SoundCatalogEntry;
}): boolean {
	const { license } = entry;
	return (
		license.reviewStatus === "verified" &&
		license.commercialUseAllowed &&
		license.derivativeUseAllowed &&
		(!license.attributionRequired || Boolean(license.attributionText))
	);
}

export function filterSoundCatalog({
	manifest,
	filter = {},
}: {
	manifest: SoundCatalogManifest;
	filter?: SoundCatalogFilter;
}): SoundCatalogEntry[] {
	const {
		query = "",
		kinds = [],
		moods = [],
		themes = [],
		tags = [],
		tagMatch = "all",
		minimumBpm,
		maximumBpm,
		maximumDurationSeconds,
		commercialUseOnly = true,
		includeReviewNeeded = false,
	} = filter;

	return manifest.entries.filter((entry) => {
		if (commercialUseOnly && !isSoundCatalogEntrySafeForEditing({ entry })) {
			return false;
		}
		if (
			!includeReviewNeeded &&
			entry.license.reviewStatus === "review-needed"
		) {
			return false;
		}
		if (kinds.length > 0 && !kinds.includes(entry.kind)) return false;
		if (!includesAny({ values: entry.moods, requested: moods })) return false;
		if (!includesAny({ values: entry.themes, requested: themes })) return false;
		if (
			!matchesTags({
				entryTags: entry.tags,
				requestedTags: tags,
				match: tagMatch,
			})
		) {
			return false;
		}
		if (!matchesText({ entry, query })) return false;
		if (minimumBpm !== undefined && (entry.bpm ?? 0) < minimumBpm) {
			return false;
		}
		if (
			maximumBpm !== undefined &&
			(entry.bpm ?? Number.POSITIVE_INFINITY) > maximumBpm
		) {
			return false;
		}
		if (
			maximumDurationSeconds !== undefined &&
			entry.durationSeconds > maximumDurationSeconds
		) {
			return false;
		}
		return true;
	});
}

export function buildSoundAttribution({
	entries,
}: {
	entries: readonly SoundCatalogEntry[];
}): string[] {
	return [
		...new Set(
			entries
				.filter((entry) => entry.license.attributionRequired)
				.map((entry) => entry.license.attributionText)
				.filter((value): value is string => Boolean(value)),
		),
	];
}
