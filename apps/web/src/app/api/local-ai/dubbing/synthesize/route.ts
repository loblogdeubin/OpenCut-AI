import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import {
	DubbingRequestError,
	MAX_DUBBING_REQUEST_BYTES,
	parseDubbingSynthesisRequest,
} from "@/local-ai/dubbing-validation";
import { LocalDubbingRuntimeError } from "@/local-ai/dubbing-errors";
import { synthesizeLocalDubbing } from "@/local-ai/dubbing-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WAV_BYTES = 64 * 1024 * 1024;
let activeSynthesisJobs = 0;

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

async function readLimitedJson({ request }: { request: Request }) {
	if (!request.body)
		throw new DubbingRequestError("Body permintaan wajib diisi");
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > MAX_DUBBING_REQUEST_BYTES) {
			await reader.cancel();
			throw new DubbingRequestError("Permintaan dubber terlalu besar");
		}
		chunks.push(value);
	}
	try {
		return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
	} catch {
		throw new DubbingRequestError("JSON permintaan tidak valid");
	}
}

function errorStatus({ error }: { error: LocalDubbingRuntimeError }) {
	switch (error.code) {
		case "NOT_CONFIGURED":
			return 503;
		case "VOICE_UNAVAILABLE":
			return 400;
		case "TIMEOUT":
			return 504;
		default:
			return 502;
	}
}

function isWaveFile({ value }: { value: Buffer }) {
	return (
		value.length >= 12 &&
		value.subarray(0, 4).toString("ascii") === "RIFF" &&
		value.subarray(8, 12).toString("ascii") === "WAVE"
	);
}

export async function POST(request: Request) {
	if (
		!isSameOrigin(request) ||
		request.headers.get("x-opencut-local-ai") !== "1"
	) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!request.headers.get("content-type")?.startsWith("application/json")) {
		return NextResponse.json(
			{ error: "Content-Type harus application/json" },
			{ status: 415 },
		);
	}
	if (activeSynthesisJobs >= 1) {
		return NextResponse.json(
			{ error: "Dubber lokal sedang memproses audio lain" },
			{ status: 429, headers: { "retry-after": "2" } },
		);
	}

	let jobDirectory: string | undefined;
	activeSynthesisJobs += 1;
	try {
		const input = parseDubbingSynthesisRequest({
			value: await readLimitedJson({ request }),
		});
		jobDirectory = await mkdtemp(path.join(tmpdir(), "opencut-dubbing-"));
		const outputPath = path.join(jobDirectory, "speech.wav");
		const { provider, voice } = await synthesizeLocalDubbing({
			text: input.text,
			provider: input.provider,
			voice: input.voice,
			outputPath,
		});
		const outputStat = await stat(outputPath);
		if (outputStat.size <= 12 || outputStat.size > MAX_WAV_BYTES) {
			throw new LocalDubbingRuntimeError({
				code: "INVALID_OUTPUT",
				message: "Provider dubber menghasilkan audio yang tidak valid",
			});
		}
		const wav = await readFile(outputPath);
		if (!isWaveFile({ value: wav })) {
			throw new LocalDubbingRuntimeError({
				code: "INVALID_OUTPUT",
				message: "Provider dubber tidak menghasilkan file WAV",
			});
		}
		return new Response(wav, {
			headers: {
				"cache-control": "no-store",
				"content-type": "audio/wav",
				"x-opencut-dubbing-provider": provider,
				"x-opencut-dubbing-voice": voice,
			},
		});
	} catch (error) {
		if (error instanceof DubbingRequestError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		if (error instanceof LocalDubbingRuntimeError) {
			return NextResponse.json(
				{ error: error.message, code: error.code },
				{ status: errorStatus({ error }) },
			);
		}
		return NextResponse.json(
			{ error: "Sintesis dubber lokal gagal" },
			{ status: 500 },
		);
	} finally {
		activeSynthesisJobs = Math.max(0, activeSynthesisJobs - 1);
		if (jobDirectory) {
			await rm(jobDirectory, { recursive: true, force: true });
		}
	}
}
