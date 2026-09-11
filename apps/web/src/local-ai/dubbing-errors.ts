export class LocalDubbingRuntimeError extends Error {
	public readonly code:
		| "NOT_CONFIGURED"
		| "VOICE_UNAVAILABLE"
		| "TIMEOUT"
		| "SYNTHESIS_FAILED"
		| "INVALID_OUTPUT";

	constructor({
		code,
		message,
	}: {
		code: LocalDubbingRuntimeError["code"];
		message: string;
	}) {
		super(message);
		this.code = code;
		this.name = "LocalDubbingRuntimeError";
	}
}
