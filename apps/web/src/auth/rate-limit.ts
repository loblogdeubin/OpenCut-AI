import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { webEnv } from "@/env/web";

const redis = new Redis({
	url: webEnv.UPSTASH_REDIS_REST_URL,
	token: webEnv.UPSTASH_REDIS_REST_TOKEN,
});

export const baseRateLimit = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 requests per minute
	analytics: true,
	prefix: "rate-limit",
});

const LOCAL_WINDOW_MS = 60_000;
const LOCAL_REQUEST_LIMIT = 100;
const localWindows = new Map<string, { count: number; resetAt: number }>();

function checkLocalRateLimit({ identifier }: { identifier: string }) {
	const now = Date.now();
	const current = localWindows.get(identifier);
	if (!current || current.resetAt <= now) {
		localWindows.set(identifier, {
			count: 1,
			resetAt: now + LOCAL_WINDOW_MS,
		});
		return { success: true, limited: false };
	}
	current.count += 1;
	return {
		success: current.count <= LOCAL_REQUEST_LIMIT,
		limited: current.count > LOCAL_REQUEST_LIMIT,
	};
}

export async function checkRateLimit({ request }: { request: Request }) {
	const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
	if (
		process.env.OPENCUT_DESKTOP_LOCAL === "1" ||
		webEnv.NODE_ENV === "development"
	) {
		return checkLocalRateLimit({ identifier: ip });
	}
	const { success } = await baseRateLimit.limit(ip);
	return { success, limited: !success };
}
