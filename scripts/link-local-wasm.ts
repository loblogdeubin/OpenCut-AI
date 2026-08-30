import { existsSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const wasmPackage = join(root, "rust", "wasm", "pkg");
const requiredArtifacts = [
	"package.json",
	"opencut_wasm.js",
	"opencut_wasm_bg.js",
	"opencut_wasm_bg.wasm",
];

for (const artifact of requiredArtifacts) {
	if (!existsSync(join(wasmPackage, artifact))) {
		throw new Error(
			`Missing ${artifact}. Run \`bun run build:wasm\` before linking the local package.`,
		);
	}
}

const installLocations = [
	join(root, "node_modules", "opencut-wasm"),
	join(root, "apps", "web", "node_modules", "opencut-wasm"),
];

for (const installLocation of installLocations) {
	rmSync(installLocation, { recursive: true, force: true });
	symlinkSync(relative(dirname(installLocation), wasmPackage), installLocation);
}

console.log("Linked opencut-wasm to rust/wasm/pkg for root and apps/web.");
