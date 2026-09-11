import type { SavedSound, SoundEffect } from "./types";
import type {
	SoundCatalogEntry,
	SoundCatalogKind,
	SoundCatalogLicense,
	SoundCatalogMood,
	SoundCatalogTheme,
} from "./catalog-types";

import {
	soundCatalogMoodSchema,
	soundCatalogThemeSchema,
} from "./catalog-types";

const LICENSE_REVIEWED_AT = "2026-09-07T00:00:00.000Z";

interface NormalizedFreesoundLicense {
	licenseId: string;
	licenseName: string;
	licenseUrl: string;
	attributionRequired: boolean;
	commercialUseAllowed: boolean;
	derivativeUseAllowed: boolean;
	reviewStatus: SoundCatalogLicense["reviewStatus"];
}

function normalizedLicenseUrl({ rawLicense }: { rawLicense: string }): string {
	try {
		const url = new URL(rawLicense);
		if (url.protocol === "https:") return url.toString();
		if (url.protocol === "http:") {
			url.protocol = "https:";
			return url.toString();
		}
	} catch {
		// Human-readable Freesound license names are normalized below.
	}
	return "https://freesound.org/help/faq/#licenses";
}

function normalizeFreesoundLicense({
	rawLicense,
}: {
	rawLicense: string;
}): NormalizedFreesoundLicense {
	const value = rawLicense.trim().toLocaleLowerCase("en-US");
	const licenseUrl = normalizedLicenseUrl({ rawLicense });
	const version = value.includes("4.0") ? "4.0" : "3.0";
	const hasNonCommercial =
		value.includes("by-nc") || value.includes("noncommercial");
	const hasNoDerivatives =
		value.includes("by-nd") ||
		value.includes("no derivatives") ||
		value.includes("noderivatives");
	const isShareAlike = value.includes("by-sa") || value.includes("sharealike");

	if (
		value.includes("cc0") ||
		value.includes("creative commons 0") ||
		value.includes("publicdomain/zero")
	) {
		return {
			licenseId: "CC0-1.0",
			licenseName: "Creative Commons Zero 1.0",
			licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
			attributionRequired: false,
			commercialUseAllowed: true,
			derivativeUseAllowed: true,
			reviewStatus: "verified",
		};
	}

	if (
		value.includes("public domain") ||
		value.includes("publicdomain/mark") ||
		value.includes("pdm")
	) {
		return {
			licenseId: "PDM-1.0",
			licenseName: "Public Domain Mark 1.0",
			licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
			attributionRequired: false,
			commercialUseAllowed: true,
			derivativeUseAllowed: true,
			reviewStatus: "verified",
		};
	}

	if (hasNonCommercial) {
		const suffix = hasNoDerivatives ? "NC-ND" : isShareAlike ? "NC-SA" : "NC";
		return {
			licenseId: `CC-BY-${suffix}-${version}`,
			licenseName: `Creative Commons Attribution-${suffix} ${version}`,
			licenseUrl,
			attributionRequired: true,
			commercialUseAllowed: false,
			derivativeUseAllowed: !hasNoDerivatives,
			reviewStatus: "verified",
		};
	}

	if (hasNoDerivatives) {
		return {
			licenseId: `CC-BY-ND-${version}`,
			licenseName: `Creative Commons Attribution-NoDerivatives ${version}`,
			licenseUrl,
			attributionRequired: true,
			commercialUseAllowed: true,
			derivativeUseAllowed: false,
			reviewStatus: "verified",
		};
	}

	if (isShareAlike) {
		return {
			licenseId: `CC-BY-SA-${version}`,
			licenseName: `Creative Commons Attribution-ShareAlike ${version}`,
			licenseUrl,
			attributionRequired: true,
			commercialUseAllowed: true,
			derivativeUseAllowed: true,
			reviewStatus: "verified",
		};
	}

	if (
		value === "attribution" ||
		value.includes("cc-by") ||
		value.includes("licenses/by/") ||
		value.includes("attribution")
	) {
		return {
			licenseId: `CC-BY-${version}`,
			licenseName: `Creative Commons Attribution ${version}`,
			licenseUrl,
			attributionRequired: true,
			commercialUseAllowed: true,
			derivativeUseAllowed: true,
			reviewStatus: "verified",
		};
	}

	return {
		licenseId: "LicenseRef-Freesound-Unreviewed",
		licenseName: rawLicense.trim().slice(0, 160) || "Unknown Freesound license",
		licenseUrl: "https://freesound.org/help/faq/#licenses",
		attributionRequired: true,
		commercialUseAllowed: false,
		derivativeUseAllowed: false,
		reviewStatus: "review-needed",
	};
}

function toHttpsUrl({ value }: { value?: string }): string | undefined {
	if (!value) return undefined;
	try {
		const url = new URL(value);
		if (url.protocol === "http:") url.protocol = "https:";
		return url.protocol === "https:" ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

function inferKind({ tags }: { tags: string[] }): SoundCatalogKind {
	const normalizedTags = new Set(
		tags.map((tag) => tag.trim().toLocaleLowerCase("en-US")),
	);
	if (
		["transition", "whoosh", "swoosh", "swish"].some((tag) =>
			normalizedTags.has(tag),
		)
	) {
		return "transition";
	}
	if (
		["music", "song", "instrumental"].some((tag) => normalizedTags.has(tag))
	) {
		return "music";
	}
	return "sound-effect";
}

function inferMoods({ tags }: { tags: string[] }): SoundCatalogMood[] {
	const matches = tags.flatMap((tag) => {
		const result = soundCatalogMoodSchema.safeParse(
			tag.trim().toLocaleLowerCase("en-US"),
		);
		return result.success ? [result.data] : [];
	});
	return matches.length > 0 ? [...new Set(matches)] : ["neutral"];
}

function inferThemes({ tags }: { tags: string[] }): SoundCatalogTheme[] {
	const matches = tags.flatMap((tag) => {
		const result = soundCatalogThemeSchema.safeParse(
			tag.trim().toLocaleLowerCase("en-US"),
		);
		return result.success ? [result.data] : [];
	});
	return matches.length > 0 ? [...new Set(matches)] : ["general"];
}

function buildLicense({
	rawLicense,
	creator,
	sourceUrl,
	title,
}: {
	rawLicense: string;
	creator: string;
	sourceUrl: string;
	title: string;
}): SoundCatalogLicense {
	const normalized = normalizeFreesoundLicense({ rawLicense });
	return {
		...normalized,
		sourceUrl,
		creator,
		attributionText: normalized.attributionRequired
			? `“${title}” by ${creator} — ${normalized.licenseId} (${sourceUrl})`
			: undefined,
		reviewedAt:
			normalized.reviewStatus === "verified" ? LICENSE_REVIEWED_AT : undefined,
	};
}

function buildCatalogEntry({
	id,
	title,
	description,
	username,
	duration,
	tags,
	license,
	previewUrl,
}: {
	id: number;
	title: string;
	description: string;
	username: string;
	duration: number;
	tags: string[];
	license: string;
	previewUrl?: string;
}): SoundCatalogEntry | null {
	const safePreviewUrl = toHttpsUrl({ value: previewUrl });
	if (
		!Number.isSafeInteger(id) ||
		id <= 0 ||
		!Number.isFinite(duration) ||
		duration <= 0 ||
		duration > 21_600 ||
		!safePreviewUrl
	) {
		return null;
	}

	const sourceUrl = `https://freesound.org/s/${id}/`;
	const safeTitle = title.trim().slice(0, 200) || `Freesound ${id}`;
	const safeCreator =
		username.trim().slice(0, 160) || "Unknown Freesound creator";
	const cleanedTags = [
		...new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
	].slice(0, 40);

	return {
		id: `freesound.${id}`,
		title: safeTitle,
		description: description.trim().slice(0, 1000),
		kind: inferKind({ tags: cleanedTags }),
		durationSeconds: duration,
		moods: inferMoods({ tags: cleanedTags }),
		themes: inferThemes({ tags: cleanedTags }),
		tags: cleanedTags,
		license: buildLicense({
			rawLicense: license,
			creator: safeCreator,
			sourceUrl,
			title: safeTitle,
		}),
		media: {
			previewUrl: safePreviewUrl,
			mimeType: safePreviewUrl.includes(".ogg") ? "audio/ogg" : "audio/mpeg",
		},
	};
}

export function soundEffectToCatalogEntry({
	sound,
}: {
	sound: SoundEffect;
}): SoundCatalogEntry | null {
	return buildCatalogEntry({
		id: sound.id,
		title: sound.name,
		description: sound.description,
		username: sound.username,
		duration: sound.duration,
		tags: sound.tags,
		license: sound.license,
		previewUrl: sound.previewUrl,
	});
}

export function savedSoundToCatalogEntry({
	sound,
}: {
	sound: SavedSound;
}): SoundCatalogEntry | null {
	return buildCatalogEntry({
		id: sound.id,
		title: sound.name,
		description: "Saved from Freesound",
		username: sound.username,
		duration: sound.duration,
		tags: sound.tags,
		license: sound.license,
		previewUrl: sound.previewUrl,
	});
}
