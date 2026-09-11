import { execFile, spawn } from "node:child_process";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { LocalDubbingRuntimeError } from "@/local-ai/dubbing-errors";
import { isSafeDubbingVoiceId } from "@/local-ai/dubbing-validation";
import { resolveLocalAiCommand } from "@/local-ai/server-paths";
import type { LocalDubbingProviderPreflight } from "@/local-ai/types";

const execFileAsync = promisify(execFile);
const PIPER_TIMEOUT_MS = 2 * 60_000;
const MAX_PIPER_DIAGNOSTIC_BYTES = 64 * 1024;
const DEFAULT_MODEL_DIRECTORY = path.join(".local-ai", "models", "piper");

interface PiperRuntime {
	command: string;
	version?: string;
	models: Map<string, string>;
	defaultVoice?: string;
}

async function existingFile({ candidate }: { candidate: string }) {
	try {
		const resolved = await realpath(candidate);
		return (await stat(resolved)).isFile() ? resolved : undefined;
	} catch {
		return undefined;
	}
}

async function resolveExecutable({ command }: { command: string }) {
	if (path.isAbsolute(command) || command.includes(path.sep)) {
		return existingFile({ candidate: path.resolve(command) });
	}
	try {
		const locator = process.platform === "win32" ? "where.exe" : "which";
		const { stdout } = await execFileAsync(locator, [command], {
			timeout: 3_000,
			maxBuffer: 16 * 1024,
			windowsHide: true,
		});
		for (const candidate of stdout.split(/\r?\n/).map((line) => line.trim())) {
			if (!candidate) continue;
			const resolved = await existingFile({ candidate });
			if (resolved) return resolved;
		}
	} catch {
		// Piper is optional; an unavailable executable is reported by preflight.
	}
	return undefined;
}

async function readPiperVersion({ command }: { command: string }) {
	try {
		const { stdout, stderr } = await execFileAsync(command, ["--version"], {
			timeout: 5_000,
			maxBuffer: 64 * 1024,
			windowsHide: true,
		});
		return `${stdout}${stderr}`.split(/\r?\n/).find(Boolean)?.trim();
	} catch {
		return undefined;
	}
}

function modelVoiceId({ modelPath }: { modelPath: string }) {
	const extension = path.extname(modelPath);
	return path.basename(modelPath, extension);
}

async function isUsableModel({ modelPath }: { modelPath: string }) {
	if (path.extname(modelPath).toLowerCase() !== ".onnx") return false;
	const configPath = `${modelPath}.json`;
	return Boolean(
		(await existingFile({ candidate: modelPath })) &&
		(await existingFile({ candidate: configPath })),
	);
}

async function discoverModels(): Promise<Map<string, string>> {
	const models = new Map<string, string>();
	const explicitModel = process.env.OPENCUT_PIPER_MODEL?.trim();
	if (explicitModel) {
		const modelPath = path.resolve(explicitModel);
		const voice = modelVoiceId({ modelPath });
		if (
			isSafeDubbingVoiceId({ voice }) &&
			(await isUsableModel({ modelPath }))
		) {
			models.set(voice, await realpath(modelPath));
		}
	}

	const relativeModelDirectory = process.env.OPENCUT_PIPER_MODEL_DIR?.trim();
	const directoryCandidates = [
		relativeModelDirectory,
		path.resolve(process.cwd(), DEFAULT_MODEL_DIRECTORY),
		path.resolve(process.cwd(), "../..", DEFAULT_MODEL_DIRECTORY),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of directoryCandidates) {
		let entries;
		try {
			entries = await readdir(path.resolve(candidate), { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (
				!entry.isFile() ||
				path.extname(entry.name).toLowerCase() !== ".onnx"
			) {
				continue;
			}
			const voice = modelVoiceId({ modelPath: entry.name });
			if (!isSafeDubbingVoiceId({ voice }) || models.has(voice)) continue;
			const modelPath = path.resolve(candidate, entry.name);
			if (await isUsableModel({ modelPath })) {
				models.set(voice, await realpath(modelPath));
			}
		}
	}

	return new Map(
		[...models.entries()].sort(([left], [right]) => left.localeCompare(right)),
	);
}

export async function inspectPiperRuntime(): Promise<PiperRuntime | undefined> {
	const configuredCommand =
		process.env.OPENCUT_PIPER_BIN?.trim() || resolveLocalAiCommand("piper");
	const command = await resolveExecutable({ command: configuredCommand });
	if (!command) return undefined;
	const models = await discoverModels();
	const configuredDefaultVoice = process.env.OPENCUT_PIPER_VOICE?.trim();
	const defaultVoice =
		configuredDefaultVoice && models.has(configuredDefaultVoice)
			? configuredDefaultVoice
			: models.keys().next().value;
	return {
		command,
		version: await readPiperVersion({ command }),
		models,
		defaultVoice,
	};
}

export async function getPiperPreflight(): Promise<LocalDubbingProviderPreflight> {
	const runtime = await inspectPiperRuntime();
	if (!runtime) {
		return {
			id: "piper",
			available: false,
			voices: [],
			reason: "binary_missing",
		};
	}
	const voices = [...runtime.models.keys()].map((id) => ({
		id,
		label: id.replaceAll("_", " ").replaceAll("-", " "),
	}));
	return {
		id: "piper",
		available: voices.length > 0,
		version: runtime.version,
		voices,
		defaultVoice: runtime.defaultVoice,
		...(voices.length === 0 ? { reason: "model_missing" as const } : {}),
	};
}

function runPiper({
	command,
	modelPath,
	outputPath,
	text,
	timeoutMs,
}: {
	command: string;
	modelPath: string;
	outputPath: string;
	text: string;
	timeoutMs: number;
}) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(
			command,
			["--model", modelPath, "--output_file", outputPath],
			{
				shell: false,
				windowsHide: true,
				stdio: ["pipe", "ignore", "pipe"],
			},
		);
		let settled = false;
		let timedOut = false;
		let diagnostics = "";
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (error) reject(error);
			else resolve();
		};
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, timeoutMs);

		child.stderr.on("data", (chunk: Buffer) => {
			if (Buffer.byteLength(diagnostics) >= MAX_PIPER_DIAGNOSTIC_BYTES) return;
			diagnostics += chunk
				.toString("utf8")
				.slice(0, MAX_PIPER_DIAGNOSTIC_BYTES - Buffer.byteLength(diagnostics));
		});
		child.once("error", () => {
			finish(
				new LocalDubbingRuntimeError({
					code: "SYNTHESIS_FAILED",
					message: "Piper gagal dijalankan",
				}),
			);
		});
		child.once("close", (code) => {
			if (timedOut) {
				finish(
					new LocalDubbingRuntimeError({
						code: "TIMEOUT",
						message: "Proses dubber melewati batas waktu",
					}),
				);
				return;
			}
			if (code !== 0) {
				finish(
					new LocalDubbingRuntimeError({
						code: "SYNTHESIS_FAILED",
						message: diagnostics.trim()
							? "Piper tidak dapat menyintesis audio"
							: "Proses Piper berhenti sebelum audio selesai",
					}),
				);
				return;
			}
			finish();
		});
		child.stdin.once("error", () => {
			// Process exit/error handlers provide the stable public failure message.
		});
		child.stdin.end(text, "utf8");
	});
}

export async function synthesizeWithPiper({
	text,
	voice,
	outputPath,
	timeoutMs = PIPER_TIMEOUT_MS,
}: {
	text: string;
	voice?: string;
	outputPath: string;
	timeoutMs?: number;
}): Promise<{ voice: string }> {
	const runtime = await inspectPiperRuntime();
	if (!runtime || runtime.models.size === 0 || !runtime.defaultVoice) {
		throw new LocalDubbingRuntimeError({
			code: "NOT_CONFIGURED",
			message: "Piper atau model voice belum dikonfigurasi",
		});
	}
	const selectedVoice = voice ?? runtime.defaultVoice;
	const modelPath = runtime.models.get(selectedVoice);
	if (!modelPath) {
		throw new LocalDubbingRuntimeError({
			code: "VOICE_UNAVAILABLE",
			message: "Voice dubber tidak tersedia",
		});
	}
	await runPiper({
		command: runtime.command,
		modelPath,
		outputPath,
		text,
		timeoutMs,
	});
	return { voice: selectedVoice };
}
