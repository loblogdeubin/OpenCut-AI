import { describe, expect, test } from "bun:test";
import {
	DEFAULT_NEW_ELEMENT_DURATION,
	toElementDurationTicks,
} from "@/timeline/creation";

describe("toElementDurationTicks", () => {
	test("uses the default duration when video metadata is not finite", () => {
		for (const seconds of [undefined, NaN, Infinity, -Infinity, 0, -1]) {
			expect(toElementDurationTicks({ seconds })).toBe(
				DEFAULT_NEW_ELEMENT_DURATION,
			);
		}
	});
});
