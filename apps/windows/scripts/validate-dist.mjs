import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(scriptDirectory, "../dist");
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

const maxExecutableBytes = 500 * 1024 * 1024;
const executableNames = readdirSync(distDirectory).filter((name) =>
	/^OpenCut-AI-(Setup|Portable)-.+-x64\.exe$/.test(name),
);

if (executableNames.length !== 2) {
	throw new Error(
		`Hasil packaging harus memiliki installer dan portable, ditemukan: ${executableNames.join(", ") || "tidak ada"}.`,
	);
}

for (const executableName of executableNames) {
	const bytes = statSync(path.join(distDirectory, executableName)).size;
	const megabytes = bytes / (1024 * 1024);
	console.log(`${executableName}: ${megabytes.toFixed(1)} MB`);
	if (bytes > maxExecutableBytes) {
		throw new Error(
			`${executableName} melebihi batas distribusi 500 MB (${megabytes.toFixed(1)} MB).`,
		);
	}
}
