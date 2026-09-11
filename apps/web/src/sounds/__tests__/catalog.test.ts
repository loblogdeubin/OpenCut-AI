import { describe, expect, test } from "bun:test";
import {
	buildSoundAttribution,
	filterSoundCatalog,
	isSoundCatalogEntrySafeForEditing,
	parseSoundCatalog,
} from "../catalog";
import type { SoundCatalogEntry, SoundCatalogManifest } from "../catalog-types";
import { builtInSoundCatalog } from "../catalog-manifest";
import {
	savedSoundToCatalogEntry,
	soundEffectToCatalogEntry,
} from "../catalog-adapter";
import type { SoundEffect } from "../types";

const checksum = `sha256:${"a".repeat(64)}`;

function makeEntry({
	id,
	kind = "music",
	moods = ["calm"],
	themes = ["education"],
	tags = [],
	bpm = 90,
	commercialUseAllowed = true,
	derivativeUseAllowed = true,
	reviewStatus = "verified",
	attributionRequired = false,
}: {
	id: string;
	kind?: SoundCatalogEntry["kind"];
	moods?: SoundCatalogEntry["moods"];
	themes?: SoundCatalogEntry["themes"];
	tags?: string[];
	bpm?: number;
	commercialUseAllowed?: boolean;
	derivativeUseAllowed?: boolean;
	reviewStatus?: SoundCatalogEntry["license"]["reviewStatus"];
	attributionRequired?: boolean;
}): SoundCatalogEntry {
	return {
		id,
		title: `Catalog item ${id}`,
		description: "Synthetic fixture used only by unit tests",
		kind,
		durationSeconds: 12,
		bpm,
		moods,
		themes,
		tags,
		license: {
			licenseId: "CC-BY-4.0",
			licenseName: "Creative Commons Attribution 4.0",
			licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
			sourceUrl: `https://example.com/audio/${id}`,
			creator: "OpenCut test fixture",
			attributionRequired,
			attributionText: attributionRequired
				? `Catalog item ${id} by OpenCut test fixture (CC BY 4.0)`
				: undefined,
			commercialUseAllowed,
			derivativeUseAllowed,
			reviewStatus,
			reviewedAt:
				reviewStatus === "verified" ? "2026-09-07T00:00:00.000Z" : undefined,
		},
		media: {
			downloadUrl: `https://example.com/audio/${id}.wav`,
			mimeType: "audio/wav",
			sha256: checksum,
		},
	};
}

function makeManifest(entries: SoundCatalogEntry[]): SoundCatalogManifest {
	return {
		schemaVersion: "1.0",
		catalogId: "opencut.test",
		name: "OpenCut test catalog",
		updatedAt: "2026-09-07T00:00:00.000Z",
		entries,
	};
}

describe("sound catalog manifest", () => {
	test("ships without unreviewed or copyrighted audio", () => {
		expect(parseSoundCatalog({ manifest: builtInSoundCatalog })).toEqual(
			builtInSoundCatalog,
		);
		expect(builtInSoundCatalog.entries).toHaveLength(0);
	});

	test("requires attribution text when a license requires credit", () => {
		const entry = makeEntry({
			id: "missing-credit",
			attributionRequired: true,
		});
		entry.license.attributionText = undefined;

		expect(() =>
			parseSoundCatalog({ manifest: makeManifest([entry]) }),
		).toThrow("Attribution text is required");
	});

	test("requires a checksum for every remote download", () => {
		const entry = makeEntry({ id: "missing-checksum" });
		entry.media.sha256 = undefined;

		expect(() =>
			parseSoundCatalog({ manifest: makeManifest([entry]) }),
		).toThrow("Remote downloads require a SHA-256 checksum");
	});

	test("rejects duplicate entry ids", () => {
		const entry = makeEntry({ id: "duplicate" });
		expect(() =>
			parseSoundCatalog({ manifest: makeManifest([entry, entry]) }),
		).toThrow("Duplicate catalog entry id");
	});
});

describe("sound catalog filtering", () => {
	const safeMusic = makeEntry({
		id: "safe-music",
		moods: ["calm", "inspiring"],
		themes: ["education", "technology"],
		tags: ["Soft Piano", "background"],
		bpm: 88,
		attributionRequired: true,
	});
	const transition = makeEntry({
		id: "clean-whoosh",
		kind: "transition",
		moods: ["energetic"],
		themes: ["sports"],
		tags: ["Whoosh", "fast"],
		bpm: 120,
	});
	const nonCommercial = makeEntry({
		id: "non-commercial",
		commercialUseAllowed: false,
	});
	const noDerivatives = makeEntry({
		id: "no-derivatives",
		derivativeUseAllowed: false,
	});
	const unreviewed = makeEntry({
		id: "unreviewed",
		reviewStatus: "review-needed",
	});
	const manifest = makeManifest([
		safeMusic,
		transition,
		nonCommercial,
		noDerivatives,
		unreviewed,
	]);

	test("allows only verified commercial derivative use by default", () => {
		expect(filterSoundCatalog({ manifest }).map((entry) => entry.id)).toEqual([
			"safe-music",
			"clean-whoosh",
		]);
		expect(isSoundCatalogEntrySafeForEditing({ entry: nonCommercial })).toBe(
			false,
		);
		expect(isSoundCatalogEntrySafeForEditing({ entry: noDerivatives })).toBe(
			false,
		);
	});

	test("filters by kind, mood, theme, and tags case-insensitively", () => {
		expect(
			filterSoundCatalog({
				manifest,
				filter: {
					kinds: ["music"],
					moods: ["inspiring"],
					themes: ["technology"],
					tags: ["soft piano", "BACKGROUND"],
				},
			}).map((entry) => entry.id),
		).toEqual(["safe-music"]);
	});

	test("supports any-tag matching and full-text search", () => {
		expect(
			filterSoundCatalog({
				manifest,
				filter: {
					query: "sports whoosh",
					tags: ["missing", "FAST"],
					tagMatch: "any",
				},
			}).map((entry) => entry.id),
		).toEqual(["clean-whoosh"]);
	});

	test("filters tempo and duration", () => {
		expect(
			filterSoundCatalog({
				manifest,
				filter: { minimumBpm: 100, maximumDurationSeconds: 15 },
			}).map((entry) => entry.id),
		).toEqual(["clean-whoosh"]);
	});

	test("produces unique required attribution lines", () => {
		expect(
			buildSoundAttribution({ entries: [safeMusic, safeMusic, transition] }),
		).toEqual(["Catalog item safe-music by OpenCut test fixture (CC BY 4.0)"]);
	});
});

describe("Freesound catalog adapter", () => {
	function makeSoundEffect({
		license,
		tags = ["whoosh", "energetic", "technology"],
	}: {
		license: string;
		tags?: string[];
	}): SoundEffect {
		return {
			id: 42,
			name: "Synthetic transition fixture",
			description: "Metadata-only test fixture",
			url: "https://freesound.org/apiv2/sounds/42/",
			previewUrl: "https://cdn.freesound.org/previews/0/42.mp3",
			duration: 1.25,
			filesize: 100,
			type: "mp3",
			channels: 2,
			bitrate: 192,
			bitdepth: 16,
			samplerate: 48_000,
			username: "Fixture author",
			tags,
			license,
			created: "2026-09-07T00:00:00.000Z",
			downloads: 0,
			rating: 0,
			ratingCount: 0,
		};
	}

	test("normalizes a CC BY effect and infers transition metadata", () => {
		const entry = soundEffectToCatalogEntry({
			sound: makeSoundEffect({
				license: "https://creativecommons.org/licenses/by/4.0/",
			}),
		});

		expect(entry).not.toBeNull();
		expect(entry?.kind).toBe("transition");
		expect(entry?.moods).toEqual(["energetic"]);
		expect(entry?.themes).toEqual(["technology"]);
		expect(entry?.license.licenseId).toBe("CC-BY-4.0");
		expect(entry && isSoundCatalogEntrySafeForEditing({ entry })).toBe(true);
		expect(
			parseSoundCatalog({
				manifest: makeManifest(entry ? [entry] : []),
			}).entries,
		).toHaveLength(1);
	});

	test("marks noncommercial licenses unsafe for commercial filtering", () => {
		const entry = soundEffectToCatalogEntry({
			sound: makeSoundEffect({ license: "Attribution Noncommercial 4.0" }),
		});
		if (!entry) throw new Error("Expected a catalog entry");

		expect(entry.license.commercialUseAllowed).toBe(false);
		expect(isSoundCatalogEntrySafeForEditing({ entry })).toBe(false);
		expect(filterSoundCatalog({ manifest: makeManifest([entry]) })).toEqual([]);
	});

	test("marks unknown licenses for review instead of assuming permission", () => {
		const entry = soundEffectToCatalogEntry({
			sound: makeSoundEffect({ license: "Custom mystery license" }),
		});
		if (!entry) throw new Error("Expected a catalog entry");

		expect(entry.license.reviewStatus).toBe("review-needed");
		expect(entry.license.commercialUseAllowed).toBe(false);
	});

	test("adapts saved sounds and rejects entries without a usable preview", () => {
		expect(
			savedSoundToCatalogEntry({
				sound: {
					id: 7,
					name: "Saved fixture",
					username: "Fixture author",
					duration: 2,
					tags: ["calm"],
					license: "CC0",
					savedAt: "2026-09-07T00:00:00.000Z",
				},
			}),
		).toBeNull();
	});
});
