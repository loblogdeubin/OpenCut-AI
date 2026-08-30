import { execFile } from "node:child_process";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { resolveLocalAiCommand } from "@/local-ai/server-paths";

export const runtime = "nodejs";
const execFileAsync = promisify(execFile);
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

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

async function probeDuration(inputPath: string): Promise<number> {
	const { stdout } = await execFileAsync(
		resolveLocalAiCommand("ffprobe"),
		[
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			inputPath,
		],
		{ timeout: 60_000 },
	);
	const duration = Number.parseFloat(stdout.trim());
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("Tidak dapat membaca durasi footage");
	}
	return duration;
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

	const jobDirectory = await mkdtemp(path.join(tmpdir(), "opencut-keyframes-"));
	const inputPath = path.join(jobDirectory, "source-media");
	const outputPath = path.join(jobDirectory, "keyframes.jpg");

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

		const duration = await probeDuration(inputPath);
		const timestamps = [0.1, 0.5, 0.9].map((ratio) =>
			Math.max(0, duration * ratio).toFixed(3),
		);
		const inputs = timestamps.flatMap((timestamp) => [
			"-ss",
			timestamp,
			"-i",
			inputPath,
		]);
		const normalizeFrame =
			"scale=320:180:force_original_aspect_ratio=decrease," +
			"pad=320:180:(ow-iw)/2:(oh-ih)/2:black";
		await execFileAsync(
			resolveLocalAiCommand("ffmpeg"),
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				...inputs,
				"-filter_complex",
				`[0:v]${normalizeFrame}[a];[1:v]${normalizeFrame}[b];[2:v]${normalizeFrame}[c];[a][b][c]hstack=inputs=3[out]`,
				"-map",
				"[out]",
				"-frames:v",
				"1",
				"-q:v",
				"3",
				outputPath,
			],
			{ timeout: 10 * 60_000, maxBuffer: 4 * 1024 * 1024 },
		);

		return new Response(await readFile(outputPath), {
			headers: {
				"cache-control": "no-store",
				"content-type": "image/jpeg",
				"x-keyframe-ratios": "0.1,0.5,0.9",
			},
		});
	} catch (error) {
		const message =
			error instanceof Error && error.message === "MEDIA_TOO_LARGE"
				? "Footage exceeds the 1 GB local keyframe limit"
				: error instanceof Error
					? error.message
					: "Ekstraksi keyframe lokal gagal";
		return NextResponse.json({ error: message }, { status: 500 });
	} finally {
		await rm(jobDirectory, { recursive: true, force: true });
	}
}
