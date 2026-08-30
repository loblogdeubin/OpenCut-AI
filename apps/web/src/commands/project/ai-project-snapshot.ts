import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { EditableProjectState } from "@/project/types";

interface EditableProjectHost {
	replaceEditableState({ state }: { state: EditableProjectState }): void;
}

export class AIProjectSnapshotCommand extends Command {
	private readonly before: EditableProjectState;
	private readonly after: EditableProjectState;
	private readonly host: EditableProjectHost | null;

	constructor({
		before,
		after,
		host,
	}: {
		before: EditableProjectState;
		after: EditableProjectState;
		host?: EditableProjectHost;
	}) {
		super();
		this.before = before;
		this.after = after;
		this.host = host ?? null;
	}

	execute(): CommandResult | undefined {
		this.apply({ state: this.after });
		return undefined;
	}

	undo(): void {
		this.apply({ state: this.before });
	}

	private apply({ state }: { state: EditableProjectState }): void {
		const host = this.host ?? EditorCore.getInstance().project;
		host.replaceEditableState({ state });
	}
}
