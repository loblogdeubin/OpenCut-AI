import { describe, expect, test } from "bun:test";
import { parseChatGptEditPlan } from "../chatgpt-bridge";

const plan = {
	schemaVersion: "1.0",
	planId: "chatgpt-plan-1",
	idempotencyKey: "chatgpt-key-1",
	projectId: "project-1",
	baseProjectRevision: 2,
	baseTimelineHash: `sha256:${"a".repeat(64)}`,
	operations: [],
};

describe("parseChatGptEditPlan", () => {
	test("parses a raw EditPlan JSON object", () => {
		expect(parseChatGptEditPlan(JSON.stringify(plan))).toEqual(plan);
	});

	test("accepts a fenced JSON response", () => {
		const response = `\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``;
		expect(parseChatGptEditPlan(response)).toEqual(plan);
	});

	test("rejects JSON that is not shaped like an edit plan", () => {
		expect(() => parseChatGptEditPlan('{"message":"hello"}')).toThrow(
			"JSON bukan EditPlanV1 yang valid.",
		);
	});
});
