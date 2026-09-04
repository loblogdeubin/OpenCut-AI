import { execFile } from "node:child_process";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import {
	findWhisperModel,
	resolveLocalAiCommand,
} from "@/local-ai/server-paths";
import type { TranscriptionResult } from "@/transcription/types";

export const runtime = "nodejs";
const execFileAsync = promisify(execFile);
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isSameOrigin(request: Request): boolean {
	const origin = request.headers.get("origin");
	const host = request.headers.get("host");
	if (!origin || !host) return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

export async function POST(request: Request) {
	if (
		!isSameOrigin(request) ||
		request.headers.get("x-opencut-local-ai") !== "1"
	) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!request.body) {
		return NextResponse.json(
			{ error: "Media body is required" },
			{ status: 400 },
		);
	}

	const language = request.headers.get("x-transcription-language") ?? "id";
	if (!/^(auto|[a-z]{2})$/.test(language)) {
		return NextResponse.json({ error: "Invalid language" }, { status: 400 });
	}

	const jobsRoot = path.join(tmpdir(), "opencut-local-ai-");
	const jobDirectory = await mkdtemp(jobsRoot);
	const inputPath = path.join(jobDirectory, "source-media");
	const audioPath = path.join(jobDirectory, "audio.wav");
	const outputBase = path.join(jobDirectory, "transcript");

	try {
		const output = await open(inputPath, "w");
		let received = 0;
		try {
			const reader = request.body.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				received += value.byteLength;
				if (received > MAX_UPLOAD_BYTES) throw new Error("MEDIA_TOO_LARGE");
				await output.write(value);
			}
		} finally {
			await output.close();
		}

		await execFileAsync(
			resolveLocalAiCommand("ffmpeg"),
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-i",
				inputPath,
				"-ar",
				"16000",
				"-ac",
				"1",
				audioPath,
			],
			{ timeout: 30 * 60_000 },
		);
		const model = await findWhisperModel();
		if (!model) throw new Error("Whisper model is missing");
		await execFileAsync(
			resolveLocalAiCommand("whisper-cli"),
			[
				"-m",
				model,
				"-l",
				language,
				"-ojf",
				"-owts",
				"-of",
				outputBase,
				audioPath,
			],
			{ timeout: 30 * 60_000, maxBuffer: 16 * 1024 * 1024 },
		);

		const raw: unknown = JSON.parse(
			await readFile(`${outputBase}.json`, "utf8"),
		);
		const rawTranscription =
			isRecord(raw) && Array.isArray(raw.transcription)
				? raw.transcription
				: [];
		const segments = rawTranscription.flatMap((segment: unknown) => {
			if (!isRecord(segment) || !isRecord(segment.offsets)) return [];
			if (
				typeof segment.text !== "string" ||
				typeof segment.offsets.from !== "number" ||
				typeof segment.offsets.to !== "number"
			)
				return [];
			const words = Array.isArray(segment.tokens)
				? segment.tokens.flatMap((token: unknown) => {
						if (!isRecord(token) || !isRecord(token.offsets)) return [];
						if (
							typeof token.text !== "string" ||
							typeof token.offsets.from !== "number" ||
							typeof token.offsets.to !== "number"
						)
							return [];
						const text = token.text.trim();
						return text && token.offsets.to > token.offsets.from
							? [
									{
										text,
										start: token.offsets.from / 1000,
										end: token.offsets.to / 1000,
									},
								]
							: [];
					})
				: [];
			return [
				{
					text: segment.text.trim(),
					start: segment.offsets.from / 1000,
					end: segment.offsets.to / 1000,
					...(words.length > 0 ? { words } : {}),
				},
			];
		});
		const rawResult = isRecord(raw) && isRecord(raw.result) ? raw.result : null;
		const result: TranscriptionResult = {
			text: segments.map((segment) => segment.text).join(" "),
			segments,
			language:
				rawResult && typeof rawResult.language === "string"
					? rawResult.language
					: language,
		};
		return NextResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error && error.message === "MEDIA_TOO_LARGE"
				? "Footage exceeds the 1 GB local transcription limit"
				: error instanceof Error
					? error.message
					: "Local transcription failed";
		return NextResponse.json({ error: message }, { status: 500 });
	} finally {
		await rm(jobDirectory, { recursive: true, force: true });
	}
}
