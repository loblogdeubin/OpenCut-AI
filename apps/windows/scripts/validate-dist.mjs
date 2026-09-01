import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packagedApp = path.resolve(
	scriptDirectory,
	"../dist/win-unpacked/resources/server/apps/web",
);
const serverEntry = path.join(packagedApp, "server.js");

if (!existsSync(serverEntry)) {
	throw new Error(`Server hasil packaging tidak ditemukan di ${serverEntry}.`);
}

const require = createRequire(import.meta.url);
try {
	require.resolve("next/package.json", { paths: [packagedApp] });
} catch (error) {
	throw new Error(
		`Installer tidak memiliki runtime Next.js yang dapat digunakan dari ${packagedApp}.`,
		{ cause: error },
	);
}

console.log("Server di hasil packaging memiliki runtime Next.js yang valid.");
