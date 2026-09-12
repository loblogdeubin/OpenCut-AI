import { type NextRequest, NextResponse } from "next/server";

function isAllowedFreesoundUrl({ value }: { value: string }): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			(url.hostname === "freesound.org" ||
				url.hostname.endsWith(".freesound.org"))
		);
	} catch {
		return false;
	}
}

export async function GET(request: NextRequest) {
	const sourceUrl = request.nextUrl.searchParams.get("url");
	if (!sourceUrl || !isAllowedFreesoundUrl({ value: sourceUrl })) {
		return NextResponse.json(
			{ error: "Invalid Freesound audio URL" },
			{ status: 400 },
		);
	}

	try {
		const response = await fetch(sourceUrl, {
			headers: { "user-agent": "OpenCut-AI/1.0" },
			cache: "force-cache",
		});
		if (!response.ok || !response.body) {
			return NextResponse.json(
				{ error: `Freesound audio unavailable (${response.status})` },
				{ status: 502 },
			);
		}
		return new NextResponse(response.body, {
			headers: {
				"content-type": response.headers.get("content-type") ?? "audio/mpeg",
				"cache-control": "public, max-age=86400, immutable",
			},
		});
	} catch (error) {
		console.error("Failed to proxy Freesound audio:", error);
		return NextResponse.json(
			{ error: "Failed to download Freesound audio" },
			{ status: 502 },
		);
	}
}
