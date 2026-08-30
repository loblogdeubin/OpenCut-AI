import * as opencutWasm from "opencut-wasm";
import type {
	AudibleRangeV1,
	DetectAudibleRangesV1Options,
	EditPlanV1,
	ProjectContentV1,
	ProjectSnapshotV1,
	ValidationResultV1,
} from "./contracts";

interface BoundaryError {
	code: string;
	message: string;
}

interface HashResult {
	ok: boolean;
	hash: string | null;
	errors: BoundaryError[];
}

interface ValidateResult {
	ok: boolean;
	validation: ValidationResultV1 | null;
	errors: BoundaryError[];
}

type ContractWasm = {
	detectAudibleRangesV1?: (options: DetectAudibleRangesV1Options) => {
		ok: boolean;
		ranges: AudibleRangeV1[];
		errors: BoundaryError[];
	};
	hashProjectContentV1?: (options: { content: ProjectContentV1 }) => HashResult;
	validateEditPlanV1?: (options: {
		snapshot: ProjectSnapshotV1;
		plan: EditPlanV1;
	}) => ValidateResult;
};

const contractWasm = opencutWasm as unknown as ContractWasm;

export function detectAudibleRanges(
	options: DetectAudibleRangesV1Options,
): AudibleRangeV1[] {
	if (!contractWasm.detectAudibleRangesV1) throw unavailableError();
	const result = contractWasm.detectAudibleRangesV1(options);
	if (!result.ok) throw boundaryFailure(result.errors);
	return result.ranges;
}

function unavailableError(): Error {
	return new Error(
		"The local opencut-wasm build does not contain editor-contracts. Run `bun run build:wasm` and link rust/wasm/pkg before enabling AI edits.",
	);
}

function boundaryFailure(errors: BoundaryError[]): Error {
	const summary = errors
		.map((error) => `${error.code}: ${error.message}`)
		.join("; ");
	return new Error(summary || "The editor-contract WASM boundary failed");
}

export function hashProjectContent({
	content,
}: {
	content: ProjectContentV1;
}): string {
	if (!contractWasm.hashProjectContentV1) throw unavailableError();
	const result = contractWasm.hashProjectContentV1({ content });
	if (!result.ok || !result.hash) throw boundaryFailure(result.errors);
	return result.hash;
}

export function validateEditPlan({
	snapshot,
	plan,
}: {
	snapshot: ProjectSnapshotV1;
	plan: EditPlanV1;
}): ValidationResultV1 {
	if (!contractWasm.validateEditPlanV1) throw unavailableError();
	const result = contractWasm.validateEditPlanV1({ snapshot, plan });
	if (!result.ok || !result.validation) throw boundaryFailure(result.errors);
	return result.validation;
}
