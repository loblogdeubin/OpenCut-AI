import { access } from "node:fs/promises";
import path from "node:path";

export function resolveLocalAiCommand(command: string): string {
	const directory = process.env.OPENCUT_AI_BIN_DIR;
	if (!directory) return command;
	const executable = process.platform === "win32" ? `${command}.exe` : command;
	return path.join(directory, executable);
}

export async function findWhisperModel(): Promise<string | undefined> {
	const configured = process.env.OPENCUT_AI_MODEL;
	const relative = path.join(".local-ai", "models", "whisper", "ggml-base.bin");
	const candidates = [
		configured,
		path.resolve(process.cwd(), relative),
		path.resolve(process.cwd(), "../..", relative),
	].filter((candidate): candidate is string => Boolean(candidate));
	for (const candidate of candidates) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// Try the next desktop or workspace-root candidate.
		}
	}
	return undefined;
}
