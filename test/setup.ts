import { mock } from "bun:test";
import { Canvas } from "@napi-rs/canvas";
import * as bindings from "opencut-wasm/opencut_wasm_bg.js";

if (typeof OffscreenCanvas === "undefined") {
	Object.defineProperty(globalThis, "OffscreenCanvas", {
		configurable: true,
		value: Canvas,
	});
}

type BindingName = Exclude<keyof typeof bindings, "__wbg_set_wasm">;

function callBinding(name: BindingName, args: unknown[]): unknown {
	const binding = bindings[name];
	if (typeof binding !== "function") {
		throw new Error(`opencut-wasm binding ${name} is not callable`);
	}
	return Reflect.apply(binding, undefined, args);
}

// Register synchronously: Bun can resolve test imports while this preload waits
// for WASM instantiation. Mock both forms because app aliases resolve the bare
// package specifier to its absolute entry point before module evaluation.
const wasmModuleFactory = () => ({
	MediaChecksumV1: bindings.MediaChecksumV1,
	detectAudibleRangesV1: (...args: unknown[]) =>
		callBinding("detectAudibleRangesV1", args),
	TICKS_PER_SECOND: (...args: unknown[]) =>
		callBinding("TICKS_PER_SECOND", args),
	applyEffectPasses: (...args: unknown[]) =>
		callBinding("applyEffectPasses", args),
	applyMaskFeather: (...args: unknown[]) =>
		callBinding("applyMaskFeather", args),
	floorToFrame: (...args: unknown[]) => callBinding("floorToFrame", args),
	formatTimecode: (...args: unknown[]) => callBinding("formatTimecode", args),
	getCompositorCanvas: (...args: unknown[]) =>
		callBinding("getCompositorCanvas", args),
	getLastFrameProfile: (...args: unknown[]) =>
		callBinding("getLastFrameProfile", args),
	guessTimecodeFormat: (...args: unknown[]) =>
		callBinding("guessTimecodeFormat", args),
	hashProjectContentV1: (...args: unknown[]) =>
		callBinding("hashProjectContentV1", args),
	initCompositor: (...args: unknown[]) => callBinding("initCompositor", args),
	initializeGpu: (...args: unknown[]) => callBinding("initializeGpu", args),
	isFrameAligned: (...args: unknown[]) => callBinding("isFrameAligned", args),
	lastFrameTime: (...args: unknown[]) => callBinding("lastFrameTime", args),
	mediaTimeAdd: (...args: unknown[]) => callBinding("mediaTimeAdd", args),
	mediaTimeClamp: (...args: unknown[]) => callBinding("mediaTimeClamp", args),
	mediaTimeFromFrame: (...args: unknown[]) =>
		callBinding("mediaTimeFromFrame", args),
	mediaTimeFromSeconds: (...args: unknown[]) =>
		callBinding("mediaTimeFromSeconds", args),
	mediaTimeMax: (...args: unknown[]) => callBinding("mediaTimeMax", args),
	mediaTimeMin: (...args: unknown[]) => callBinding("mediaTimeMin", args),
	mediaTimeSub: (...args: unknown[]) => callBinding("mediaTimeSub", args),
	mediaTimeToFrame: (...args: unknown[]) =>
		callBinding("mediaTimeToFrame", args),
	mediaTimeToSeconds: (...args: unknown[]) =>
		callBinding("mediaTimeToSeconds", args),
	parseTimecode: (...args: unknown[]) => callBinding("parseTimecode", args),
	releaseTexture: (...args: unknown[]) => callBinding("releaseTexture", args),
	renderFrame: (...args: unknown[]) => callBinding("renderFrame", args),
	resizeCompositor: (...args: unknown[]) =>
		callBinding("resizeCompositor", args),
	roundToFrame: (...args: unknown[]) => callBinding("roundToFrame", args),
	snappedSeekTime: (...args: unknown[]) => callBinding("snappedSeekTime", args),
	uploadTexture: (...args: unknown[]) => callBinding("uploadTexture", args),
	validateEditPlanV1: (...args: unknown[]) =>
		callBinding("validateEditPlanV1", args),
});
mock.module("opencut-wasm", wasmModuleFactory);
mock.module(import.meta.resolve("opencut-wasm"), wasmModuleFactory);

const wasmUrl = new URL(
	"../node_modules/opencut-wasm/opencut_wasm_bg.wasm",
	import.meta.url,
);
const wasmBytes = await Bun.file(wasmUrl).arrayBuffer();
const { instance } = await WebAssembly.instantiate(wasmBytes, {
	"./opencut_wasm_bg.js": bindings,
});

bindings.__wbg_set_wasm(instance.exports);

const start = instance.exports.__wbindgen_start;
if (typeof start !== "function") {
	throw new Error("opencut-wasm is missing its __wbindgen_start export");
}
start();

// wasm-pack's bundler target relies on the JavaScript bundler to instantiate
// `.wasm` imports. Bun currently exposes that import as a module without the
// WASM exports. Tests use the real WASM instance prepared above, while Next.js
// production builds continue to use the package's normal bundler entry point.
