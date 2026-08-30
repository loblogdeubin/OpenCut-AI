import { AIProjectSnapshotCommand } from "@/commands/project";
import type { EditorCore } from "@/core";
import type {
	EditPlanV1,
	ProjectSnapshotV1,
	ValidationResultV1,
} from "./contracts";
import { reduceEditPlan } from "./reducer";
import { projectToSnapshotV1 } from "./snapshot";
import { hashProjectContent, validateEditPlan } from "./wasm-boundary";

export interface ProjectSnapshotWithHash {
	snapshot: ProjectSnapshotV1;
	timelineHash: string;
}

export type ApplyEditPlanResult =
	| {
			status: "committed" | "already_committed";
			transactionId: string;
			planId: string;
			beforeHash: string;
			afterHash: string;
	  }
	| { status: "rejected"; validation: ValidationResultV1 };

interface CommittedTransaction {
	transactionId: string;
	planId: string;
	idempotencyKey: string;
	beforeHash: string;
	afterHash: string;
	command: AIProjectSnapshotCommand;
	state: "committed" | "undone";
}

export class OpenCutEditorAdapter {
	private readonly transactions = new Map<string, CommittedTransaction>();

	constructor(private readonly editor: EditorCore) {}

	getProjectSnapshot(): ProjectSnapshotWithHash {
		const project = this.editor.project.getActive();
		const snapshot = projectToSnapshotV1({
			project,
			mediaAssets: this.editor.media.getAssets(),
		});
		return {
			snapshot,
			timelineHash: hashProjectContent({ content: snapshot.content }),
		};
	}

	validatePlan({ plan }: { plan: EditPlanV1 }): ValidationResultV1 {
		const { snapshot } = this.getProjectSnapshot();
		return validateEditPlan({ snapshot, plan });
	}

	applyPlan({ plan }: { plan: EditPlanV1 }): ApplyEditPlanResult {
		const existing = this.transactions.get(plan.idempotencyKey);
		if (existing) {
			if (existing.planId !== plan.planId) {
				throw new Error("Idempotency key is already bound to another plan");
			}
			return {
				status: "already_committed",
				transactionId: existing.transactionId,
				planId: existing.planId,
				beforeHash: existing.beforeHash,
				afterHash: existing.afterHash,
			};
		}

		const { snapshot, timelineHash: beforeHash } = this.getProjectSnapshot();
		const validation = validateEditPlan({ snapshot, plan });
		if (!validation.valid) return { status: "rejected", validation };

		const project = this.editor.project.getActive();
		const before = this.editor.project.getEditableState();
		const reduced = reduceEditPlan({
			project,
			mediaAssets: this.editor.media.getAssets(),
			plan,
		});
		const command = new AIProjectSnapshotCommand({
			before,
			after: {
				...reduced,
				revision: before.revision + 1,
			},
			host: this.editor.project,
		});

		this.editor.command.execute({ command });
		let afterHash: string;
		try {
			afterHash = this.getProjectSnapshot().timelineHash;
		} catch (error) {
			this.editor.command.undoExpected({ command });
			throw error;
		}

		const transaction: CommittedTransaction = {
			transactionId: `${plan.projectId}:${plan.planId}`,
			planId: plan.planId,
			idempotencyKey: plan.idempotencyKey,
			beforeHash,
			afterHash,
			command,
			state: "committed",
		};
		this.transactions.set(plan.idempotencyKey, transaction);
		return {
			status: "committed",
			transactionId: transaction.transactionId,
			planId: transaction.planId,
			beforeHash: transaction.beforeHash,
			afterHash: transaction.afterHash,
		};
	}

	undoTransaction({ transactionId }: { transactionId: string }): boolean {
		const transaction = [...this.transactions.values()].find(
			(candidate) => candidate.transactionId === transactionId,
		);
		if (!transaction || transaction.state !== "committed") return false;
		if (this.getProjectSnapshot().timelineHash !== transaction.afterHash) {
			return false;
		}
		if (!this.editor.command.undoExpected({ command: transaction.command })) {
			return false;
		}
		const restoredHash = this.getProjectSnapshot().timelineHash;
		if (restoredHash !== transaction.beforeHash) {
			throw new Error(
				"AI transaction undo did not restore the original timeline",
			);
		}
		transaction.state = "undone";
		return true;
	}

	clearTransactions(): void {
		this.transactions.clear();
	}
}
