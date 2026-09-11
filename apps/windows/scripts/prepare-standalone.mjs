import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, rmSync } from "node:fs";
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
const nextDirectory = path.dirname(nextPackage);
const styledJsxPackage = path.join(
	standaloneApp,
	"node_modules",
	"styled-jsx",
	"package.json",
);

if (!existsSync(serverEntry)) {
	throw new Error(
		`Standalone Next.js belum tersedia di ${serverEntry}. Jalankan build:web terlebih dahulu.`,
	);
}

console.log("Memasang dependency produksi untuk server Windows standalone...");
// Next's standalone trace can retain Bun's workspace junction for `next`. That
// link works inside the repository but breaks after the app is installed. Make
// npm install a physical, self-contained copy instead.
if (existsSync(nextDirectory) && lstatSync(nextDirectory).isSymbolicLink()) {
	rmSync(nextDirectory, { force: true, recursive: true });
}
const npmArgs = [
	"install",
	"--omit=dev",
	"--legacy-peer-deps",
	"--no-package-lock",
	"--no-audit",
	"--no-fund",
	"--workspaces=false",
];
const npmExecutable =
	process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
const npmExecutableArgs =
	process.platform === "win32"
		? ["/d", "/s", "/c", `npm.cmd ${npmArgs.join(" ")}`]
		: npmArgs;
const install = spawnSync(npmExecutable, npmExecutableArgs, {
	cwd: standaloneApp,
	stdio: "inherit",
	windowsHide: true,
});

if (install.error) throw install.error;
if (install.status !== 0) {
	throw new Error(`Instalasi dependency standalone gagal (${install.status}).`);
}

if (!existsSync(nextPackage)) {
	throw new Error(
		`Validasi gagal: runtime Next.js tidak ditemukan di ${nextPackage}.`,
	);
}
if (lstatSync(nextDirectory).isSymbolicLink()) {
	throw new Error(`Validasi gagal: runtime Next.js masih berupa link.`);
}
if (!existsSync(styledJsxPackage)) {
	throw new Error(
		`Validasi gagal: dependency styled-jsx tidak ditemukan di ${styledJsxPackage}.`,
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
