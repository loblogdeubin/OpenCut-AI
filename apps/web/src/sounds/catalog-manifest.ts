import type { SoundCatalogManifest } from "./catalog-types";

// Intentionally empty: audio is never bundled or fetched until its license and
// provenance have been reviewed and recorded in this manifest.
export const builtInSoundCatalog = {
	schemaVersion: "1.0",
	catalogId: "opencut.built-in",
	name: "OpenCut licensed audio",
	updatedAt: "2026-09-07T00:00:00.000Z",
	entries: [],
} satisfies SoundCatalogManifest;
