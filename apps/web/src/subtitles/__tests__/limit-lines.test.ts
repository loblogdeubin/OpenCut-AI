import { expect, test } from "bun:test";
import { limitSubtitleLines } from "../limit-lines";

test("keeps subtitles editable without displaying more than two lines", () => {
	expect(limitSubtitleLines({ text: "satu\ndua\ntiga\nempat" })).toBe(
		"satu\ndua tiga empat",
	);
});
