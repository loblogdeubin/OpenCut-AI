import { NextResponse } from "next/server";
import { getLocalDubbingPreflight } from "@/local-ai/dubbing-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	return NextResponse.json(await getLocalDubbingPreflight(), {
		headers: { "cache-control": "no-store" },
	});
}
