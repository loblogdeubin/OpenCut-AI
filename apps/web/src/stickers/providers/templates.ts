import type { StickerProvider } from "@/stickers/types";

const REKAH_STUDIO_STICKER_ID = "templates:rekah-studio-ugc";
const REKAH_STUDIO_URL = "/templates/rekah-studio-ugc.png";

export const templatesProvider: StickerProvider = {
	id: "templates",
	async search({ query }) {
		const matches = "rekah studio ugc".includes(query.trim().toLowerCase());
		return {
			items: matches
				? [
						{
							id: REKAH_STUDIO_STICKER_ID,
							provider: "templates",
							name: "Rekah Studio UGC",
							previewUrl: REKAH_STUDIO_URL,
							metadata: {},
						},
					]
				: [],
			total: matches ? 1 : 0,
			hasMore: false,
		};
	},
	async browse() {
		return { sections: [] };
	},
	resolveUrl() {
		return REKAH_STUDIO_URL;
	},
};

export { REKAH_STUDIO_STICKER_ID, REKAH_STUDIO_URL };
