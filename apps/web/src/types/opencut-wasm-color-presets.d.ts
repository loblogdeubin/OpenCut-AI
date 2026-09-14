import "opencut-wasm";

declare module "opencut-wasm" {
	export function parseLightroomXmp(
		sourceName: string,
		xmp: string,
	): {
		name: string;
		params: import("@/color-presets/import").ColorPresetParams;
	};
}
