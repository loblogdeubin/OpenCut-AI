export const SYSTEM_FONTS = new Set([
	"Arial",
	"Helvetica",
	"Times New Roman",
	"Courier New",
	"Verdana",
	"Georgia",
	// Google Sans is not distributed through Google Fonts. It is used when it
	// exists on the user's device and otherwise falls back to DM Sans.
	"Google Sans",
	"Google Sans Text",
	// Gilroy is loaded from Windows when licensed/installed. Text rendering uses
	// DM Sans as a similar fallback so projects remain portable.
	"Gilroy",
	"monospace",
	"sans-serif",
	"serif",
]);
