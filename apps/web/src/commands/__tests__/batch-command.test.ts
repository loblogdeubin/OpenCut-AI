import { describe, expect, test } from "bun:test";
import { BatchCommand } from "../batch-command";
import { Command, type CommandResult } from "../base-command";

class RecordingCommand extends Command {
	constructor(
		private readonly name: string,
		private readonly events: string[],
		private readonly options: {
			failExecute?: boolean;
			failUndo?: boolean;
			result?: CommandResult;
		} = {},
	) {
		super();
	}

	execute(): CommandResult | undefined {
		this.events.push(`execute:${this.name}`);
		if (this.options.failExecute) {
			throw new Error(`execute failed: ${this.name}`);
		}
		return this.options.result;
	}

	undo(): void {
		this.events.push(`undo:${this.name}`);
		if (this.options.failUndo) {
			throw new Error(`undo failed: ${this.name}`);
		}
	}
}

describe("BatchCommand", () => {
	test("returns the latest selection result", () => {
		const events: string[] = [];
		const firstSelection: CommandResult = {
			selection: { selectedElements: [], selectedKeyframes: [] },
		};
		const latestSelection: CommandResult = {
			selection: {
				selectedElements: [{ trackId: "track", elementId: "element" }],
				selectedKeyframes: [],
			},
		};
		const batch = new BatchCommand([
			new RecordingCommand("first", events, { result: firstSelection }),
			new RecordingCommand("middle", events),
			new RecordingCommand("last", events, { result: latestSelection }),
		]);

		expect(batch.execute()).toEqual(latestSelection);
		expect(events).toEqual([
			"execute:first",
			"execute:middle",
			"execute:last",
		]);
	});

	test("rolls back every attempted command in reverse order", () => {
		const events: string[] = [];
		const batch = new BatchCommand([
			new RecordingCommand("first", events),
			new RecordingCommand("failing", events, { failExecute: true }),
			new RecordingCommand("never", events),
		]);

		expect(() => batch.execute()).toThrow("execute failed: failing");
		expect(events).toEqual([
			"execute:first",
			"execute:failing",
			"undo:failing",
			"undo:first",
		]);
	});

	test("surfaces both execution and rollback failures", () => {
		const events: string[] = [];
		const batch = new BatchCommand([
			new RecordingCommand("first", events, { failUndo: true }),
			new RecordingCommand("failing", events, { failExecute: true }),
		]);

		try {
			batch.execute();
			throw new Error("Expected batch execution to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(AggregateError);
			if (!(error instanceof AggregateError)) return;
			expect(error.errors).toHaveLength(2);
			expect(String(error.errors[0])).toContain("execute failed: failing");
			expect(String(error.errors[1])).toContain("undo failed: first");
		}
	});
});
