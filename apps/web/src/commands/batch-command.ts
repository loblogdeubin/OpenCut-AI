import { Command, type CommandResult } from "./base-command";

export class BatchCommand extends Command {
	constructor(private commands: Command[]) {
		super();
	}

	execute(): CommandResult | undefined {
		let latestSelectionResult: CommandResult | undefined;
		const executedCommands: Command[] = [];

		try {
			for (const command of this.commands) {
				executedCommands.push(command);
				const result = command.execute();
				if (result?.selection !== undefined) {
					latestSelectionResult = result;
				}
			}
		} catch (executionError) {
			const rollbackErrors: unknown[] = [];
			for (const command of [...executedCommands].reverse()) {
				try {
					command.undo();
				} catch (rollbackError) {
					rollbackErrors.push(rollbackError);
				}
			}

			if (rollbackErrors.length > 0) {
				throw new AggregateError(
					[executionError, ...rollbackErrors],
					"Batch command failed and rollback was incomplete",
				);
			}

			throw executionError;
		}

		return latestSelectionResult;
	}

	undo(): void {
		for (const command of [...this.commands].reverse()) {
			command.undo();
		}
	}

	redo(): CommandResult | undefined {
		let latestSelectionResult: CommandResult | undefined;

		for (const command of this.commands) {
			const result = command.redo();
			if (result?.selection !== undefined) {
				latestSelectionResult = result;
			}
		}

		return latestSelectionResult;
	}
}
