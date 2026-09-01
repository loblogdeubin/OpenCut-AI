import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const standaloneApp = path.resolve(
	scriptDirectory,
	"../../web/.next/standalone/apps/web",
);
const serverEntry = path.join(standaloneApp, "server.js");
const nextPackage = path.join(
	standaloneApp,
	"node_modules",
	"next",
	"package.json",
);

if (!existsSync(serverEntry)) {
	throw new Error(
		`Standalone Next.js belum tersedia di ${serverEntry}. Jalankan build:web terlebih dahulu.`,
	);
}

console.log("Memasang dependency produksi untuk server Windows standalone...");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const install = spawnSync(
	npmExecutable,
	["install", "--omit=dev", "--no-package-lock", "--no-audit", "--no-fund"],
	{
		cwd: standaloneApp,
		stdio: "inherit",
		windowsHide: true,
	},
);

if (install.error) throw install.error;
if (install.status !== 0) {
	throw new Error(`Instalasi dependency standalone gagal (${install.status}).`);
}

if (!existsSync(nextPackage)) {
	throw new Error(
		`Validasi gagal: runtime Next.js tidak ditemukan di ${nextPackage}.`,
	);
}

const resolveNext = spawnSync(
	"node",
	["-e", "require.resolve('next/package.json')"],
	{
		cwd: standaloneApp,
		stdio: "inherit",
		windowsHide: true,
	},
);

if (resolveNext.error) throw resolveNext.error;
if (resolveNext.status !== 0) {
	throw new Error("Validasi Node.js untuk runtime Next.js gagal.");
}

console.log("Runtime server Windows standalone siap dan tervalidasi.");
