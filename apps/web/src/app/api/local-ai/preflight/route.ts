import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import type { LocalAiPreflight } from "@/local-ai/types";
import {
	findWhisperModel,
	resolveLocalAiCommand,
} from "@/local-ai/server-paths";

const execFileAsync = promisify(execFile);

async function commandVersion({
	command,
	args = ["-version"],
}: {
	command: string;
	args?: string[];
}): Promise<string | undefined> {
	try {
		const { stdout, stderr } = await execFileAsync(command, args, {
			timeout: 10_000,
		});
		const lines = `${stdout}${stderr}`
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		return lines.find((line) => /version/i.test(line)) ?? lines[0] ?? command;
	} catch {
		return undefined;
	}
}

async function commandPath(command: string): Promise<string | undefined> {
	if (path.isAbsolute(command)) {
		try {
			await access(command);
			return command;
		} catch {
			return undefined;
		}
	}
	try {
		const locator = process.platform === "win32" ? "where.exe" : "which";
		const { stdout } = await execFileAsync(locator, [command], {
			timeout: 3_000,
		});
		return stdout.trim() || undefined;
	} catch {
		return undefined;
	}
}

export async function GET() {
	const [ffmpegVersion, ffprobeVersion, whisperPath, model] = await Promise.all(
		[
			commandVersion({ command: resolveLocalAiCommand("ffmpeg") }),
			commandVersion({ command: resolveLocalAiCommand("ffprobe") }),
			commandPath(resolveLocalAiCommand("whisper-cli")),
			findWhisperModel(),
		],
	);
	const result: LocalAiPreflight = {
		ffmpeg: { available: Boolean(ffmpegVersion), version: ffmpegVersion },
		ffprobe: { available: Boolean(ffprobeVersion), version: ffprobeVersion },
		transcription: {
			available: Boolean(whisperPath && model),
			engine: whisperPath ? "whisper.cpp (whisper-cli)" : undefined,
			model: model ? path.basename(model) : undefined,
		},
	};
	return NextResponse.json(result);
}
