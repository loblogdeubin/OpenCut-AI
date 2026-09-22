export function limitSubtitleLines({ text }: { text: string }): string {
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	return lines.length <= 2
		? lines.join("\n")
		: `${lines[0]}\n${lines.slice(1).join(" ")}`;
}
