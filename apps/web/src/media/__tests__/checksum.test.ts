import { describe, expect, test } from "bun:test";
import { computeMediaChecksum } from "../checksum";

describe("computeMediaChecksum", () => {
	test("streams a blob through the Rust SHA-256 implementation", async () => {
		const progress: number[] = [];
		const checksum = await computeMediaChecksum({
			file: new Blob(["Open", "Cut"]),
			onProgress: ({ processedBytes }) => progress.push(processedBytes),
		});

		expect(checksum).toBe(
			"sha256:b751c9aea6a3221e642d07d60835b99a0b862ff0668173dadc16ded029540c7b",
		);
		expect(progress.at(-1)).toBe(7);
	});
});
