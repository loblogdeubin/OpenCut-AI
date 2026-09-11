import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalDubbingRuntimeError } from "@/local-ai/dubbing-errors";
import type { LocalDubbingProviderPreflight } from "@/local-ai/types";

const SAPI_TIMEOUT_MS = 2 * 60_000;
const MAX_SAPI_OUTPUT_BYTES = 64 * 1024;
const SAPI_SCRIPT = String.raw`param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("list", "synthesize")]
    [string]$Mode,
    [string]$OutputPath,
    [string]$VoiceId
)
$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    if ($Mode -eq "list") {
        $names = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
        [Console]::Write((ConvertTo-Json -Compress -InputObject $names))
        exit 0
    }
    if ([string]::IsNullOrWhiteSpace($OutputPath)) { throw "Output path is required" }
    if (-not [string]::IsNullOrWhiteSpace($VoiceId)) {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $selectedName = $null
            foreach ($installed in $synth.GetInstalledVoices()) {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($installed.VoiceInfo.Name)
                $hash = [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant().Substring(0, 16)
                if (("sapi-" + $hash) -eq $VoiceId) { $selectedName = $installed.VoiceInfo.Name; break }
            }
            if ([string]::IsNullOrWhiteSpace($selectedName)) { throw "Voice is unavailable" }
            $synth.SelectVoice($selectedName)
        } finally {
            $sha.Dispose()
        }
    }
    $text = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($text)) { throw "Text is required" }
    $synth.SetOutputToWaveFile($OutputPath)
    $synth.Speak($text)
    $synth.SetOutputToNull()
} finally {
    $synth.Dispose()
}`;

interface SapiRuntime {
	command: string;
	voices: Map<string, string>;
	defaultVoice?: string;
}

function sapiVoiceId({ name }: { name: string }) {
	return `sapi-${createHash("sha256").update(name, "utf8").digest("hex").slice(0, 16)}`;
}

async function existingFile({ candidate }: { candidate: string }) {
	try {
		const resolved = await realpath(candidate);
		return (await stat(resolved)).isFile() ? resolved : undefined;
	} catch {
		return undefined;
	}
}

async function resolveWindowsPowerShell() {
	if (process.platform !== "win32") return undefined;
	const systemRoot = process.env.SystemRoot?.trim() || "C:\\Windows";
	const systemPowerShell = path.join(
		systemRoot,
		"System32",
		"WindowsPowerShell",
		"v1.0",
		"powershell.exe",
	);
	return existingFile({ candidate: systemPowerShell });
}

function runStaticSapiScript({
	command,
	scriptPath,
	args,
	stdin,
	timeoutMs,
}: {
	command: string;
	scriptPath: string;
	args: string[];
	stdin?: string;
	timeoutMs: number;
}) {
	return new Promise<string>((resolve, reject) => {
		const child = spawn(
			command,
			[
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				scriptPath,
				...args,
			],
			{
				shell: false,
				windowsHide: true,
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		let settled = false;
		let timedOut = false;
		let stdout = "";
		let stderr = "";
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (error) reject(error);
			else resolve(stdout);
		};
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, timeoutMs);

		child.stdout.on("data", (chunk: Buffer) => {
			if (Buffer.byteLength(stdout) < MAX_SAPI_OUTPUT_BYTES) {
				stdout += chunk
					.toString("utf8")
					.slice(0, MAX_SAPI_OUTPUT_BYTES - Buffer.byteLength(stdout));
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			if (Buffer.byteLength(stderr) < MAX_SAPI_OUTPUT_BYTES) {
				stderr += chunk
					.toString("utf8")
					.slice(0, MAX_SAPI_OUTPUT_BYTES - Buffer.byteLength(stderr));
			}
		});
		child.once("error", () => {
			finish(
				new LocalDubbingRuntimeError({
					code: "SYNTHESIS_FAILED",
					message: "Windows Speech tidak dapat dijalankan",
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
						message: stderr.trim()
							? "Windows Speech tidak dapat menyintesis audio"
							: "Windows Speech berhenti sebelum audio selesai",
					}),
				);
				return;
			}
			finish();
		});
		child.stdin.once("error", () => {
			// Process exit/error handlers provide the stable public failure message.
		});
		child.stdin.end(stdin ?? "", "utf8");
	});
}

async function withSapiScript<T>({
	operation,
}: {
	operation: (value: { command: string; scriptPath: string }) => Promise<T>;
}): Promise<T | undefined> {
	const command = await resolveWindowsPowerShell();
	if (!command) return undefined;
	const directory = await mkdtemp(path.join(tmpdir(), "opencut-sapi-"));
	const scriptPath = path.join(directory, "sapi.ps1");
	try {
		await writeFile(scriptPath, SAPI_SCRIPT, { encoding: "utf8", flag: "wx" });
		return await operation({ command, scriptPath });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

export async function inspectSapiRuntime(): Promise<SapiRuntime | undefined> {
	try {
		return await withSapiScript({
			operation: async ({ command, scriptPath }) => {
				const output = await runStaticSapiScript({
					command,
					scriptPath,
					args: ["-Mode", "list"],
					timeoutMs: 10_000,
				});
				const parsed: unknown = JSON.parse(output || "[]");
				const names = Array.isArray(parsed)
					? parsed.filter((name): name is string => typeof name === "string")
					: [];
				const voices = new Map<string, string>();
				for (const name of names) voices.set(sapiVoiceId({ name }), name);
				return {
					command,
					voices,
					defaultVoice: voices.keys().next().value,
				};
			},
		});
	} catch {
		return undefined;
	}
}

export async function getSapiPreflight(): Promise<LocalDubbingProviderPreflight> {
	const runtime = await inspectSapiRuntime();
	if (!runtime) {
		return {
			id: "windows-sapi",
			available: false,
			voices: [],
			reason: "binary_missing",
		};
	}
	const voices = [...runtime.voices].map(([id, label]) => ({ id, label }));
	return {
		id: "windows-sapi",
		available: voices.length > 0,
		version: "Windows System.Speech",
		voices,
		defaultVoice: runtime.defaultVoice,
		...(voices.length === 0 ? { reason: "model_missing" as const } : {}),
	};
}

export async function synthesizeWithSapi({
	text,
	voice,
	outputPath,
	timeoutMs = SAPI_TIMEOUT_MS,
}: {
	text: string;
	voice?: string;
	outputPath: string;
	timeoutMs?: number;
}): Promise<{ voice: string }> {
	const runtime = await inspectSapiRuntime();
	if (!runtime || runtime.voices.size === 0 || !runtime.defaultVoice) {
		throw new LocalDubbingRuntimeError({
			code: "NOT_CONFIGURED",
			message: "Windows Speech belum memiliki voice yang dapat digunakan",
		});
	}
	const selectedVoice = voice ?? runtime.defaultVoice;
	if (!runtime.voices.has(selectedVoice)) {
		throw new LocalDubbingRuntimeError({
			code: "VOICE_UNAVAILABLE",
			message: "Voice dubber tidak tersedia",
		});
	}
	const scriptPath = path.join(path.dirname(outputPath), "sapi-synthesize.ps1");
	await writeFile(scriptPath, SAPI_SCRIPT, { encoding: "utf8", flag: "wx" });
	await runStaticSapiScript({
		command: runtime.command,
		scriptPath,
		args: [
			"-Mode",
			"synthesize",
			"-OutputPath",
			outputPath,
			"-VoiceId",
			selectedVoice,
		],
		stdin: text,
		timeoutMs,
	});
	return { voice: selectedVoice };
}
