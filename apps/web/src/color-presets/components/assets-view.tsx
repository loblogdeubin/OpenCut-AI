"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	BUILT_IN_COLOR_PRESETS,
	type BuiltInColorPreset,
} from "@/color-presets/builtins";
import {
	deleteCustomColorPreset,
	importColorPresetFiles,
	loadCustomColorPresets,
	type ColorPreset,
} from "@/color-presets/import";
import type { ColorPresetAdjustments } from "@/color-presets/application";
import { cn } from "@/utils/ui";

type PresetItem =
	| BuiltInColorPreset
	| (ColorPreset & {
			source: "imported";
			category: string;
			preview: [string, string, string];
	  });
type ApplyScope = "selected" | "all";
const FAVORITES_KEY = "opencut-color-preset-favorites-v1";

function importedPreset(item: ColorPreset): PresetItem {
	return {
		...item,
		source: "imported",
		category: "Imported",
		preview: ["#ddb48e", "#718b82", "#344554"],
	};
}

function readFavorites(): string[] {
	try {
		const parsed: unknown = JSON.parse(
			localStorage.getItem(FAVORITES_KEY) ?? "[]",
		);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

export function ColorPresetsView() {
	const editor = useEditor();
	const selectedRefs = useEditor((core) =>
		core.selection.getSelectedElements(),
	);
	const fileRef = useRef<HTMLInputElement>(null);
	const [custom, setCustom] = useState<PresetItem[]>([]);
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("All");
	const [selectedId, setSelectedId] = useState(
		BUILT_IN_COLOR_PRESETS[0]?.id ?? "",
	);
	const [scope, setScope] = useState<ApplyScope>("selected");
	const [intensity, setIntensity] = useState(100);
	const [favorites, setFavorites] = useState<string[]>([]);
	const [importing, setImporting] = useState(false);

	useEffect(() => {
		void loadCustomColorPresets()
			.then((items) => {
				setCustom(items.map(importedPreset));
				setFavorites(readFavorites());
			})
			.catch(() => toast.error("Could not load imported presets"));
	}, []);

	const presets = useMemo(
		() => [...BUILT_IN_COLOR_PRESETS, ...custom],
		[custom],
	);
	const categories = useMemo(
		() => [
			"All",
			"Favorites",
			...Array.from(new Set(presets.map((preset) => preset.category))),
		],
		[presets],
	);
	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return presets.filter(
			(preset) =>
				(category === "All" ||
					(category === "Favorites"
						? favorites.includes(preset.id)
						: preset.category === category)) &&
				(!needle ||
					`${preset.name} ${preset.category}`.toLowerCase().includes(needle)),
		);
	}, [category, favorites, presets, query]);
	const selectedPreset = presets.find((preset) => preset.id === selectedId);
	const selectedTargetCount = editor.timeline
		.getElementsWithTracks({ elements: selectedRefs })
		.filter(
			({ element }) => element.type === "video" || element.type === "image",
		).length;

	const persistFavorites = (next: string[]) => {
		setFavorites(next);
		localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
	};

	const apply = () => {
		if (!selectedPreset) return;
		editor.timeline.discardPreview();
		const count = editor.timeline.applyColorPreset({
			adjustments: selectedPreset.params as ColorPresetAdjustments,
			intensity,
			scope,
		});
		if (count > 0) {
			toast.success(
				`${selectedPreset.name} applied to ${count} clip${count === 1 ? "" : "s"}`,
			);
		} else {
			toast.error(
				scope === "selected"
					? "Select a video or image clip first"
					: "No editable video or image clips found",
			);
		}
	};

	const preview = ({
		preset,
		nextIntensity = intensity,
	}: {
		preset: PresetItem;
		nextIntensity?: number;
	}) => {
		editor.timeline.discardPreview();
		editor.timeline.previewColorPreset({
			adjustments: preset.params as ColorPresetAdjustments,
			intensity: nextIntensity,
			scope,
		});
	};

	const reset = () => {
		editor.timeline.discardPreview();
		const count = editor.timeline.resetColorPreset({ scope });
		if (count > 0) {
			toast.success(`Color reset on ${count} clip${count === 1 ? "" : "s"}`);
		} else {
			toast.info("No color preset to reset");
		}
	};

	const handleImport = async (files: FileList | null) => {
		if (!files?.length) return;
		setImporting(true);
		try {
			const imported = await importColorPresetFiles({
				files: Array.from(files),
			});
			setCustom((current) => [
				...imported.map(importedPreset),
				...current.filter(
					(old) => !imported.some((item) => item.id === old.id),
				),
			]);
			if (imported[0]) setSelectedId(imported[0].id);
			toast.success(
				`${imported.length} color preset${imported.length === 1 ? "" : "s"} imported`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Preset import failed",
			);
		} finally {
			setImporting(false);
			if (fileRef.current) fileRef.current.value = "";
		}
	};

	const remove = async (preset: PresetItem) => {
		if (preset.source !== "imported") return;
		try {
			await deleteCustomColorPreset({ id: preset.id });
			setCustom((items) => items.filter((item) => item.id !== preset.id));
			persistFavorites(favorites.filter((id) => id !== preset.id));
			if (selectedId === preset.id)
				setSelectedId(BUILT_IN_COLOR_PRESETS[0]?.id ?? "");
			toast.success("Preset deleted");
		} catch {
			toast.error("Could not delete preset");
		}
	};

	return (
		<PanelView
			title="Color Presets"
			actions={
				<Button
					size="sm"
					variant="outline"
					disabled={importing}
					onClick={() => fileRef.current?.click()}
				>
					<Upload className="size-3.5" />
					{importing ? "Importing…" : "Import"}
				</Button>
			}
		>
			<input
				ref={fileRef}
				type="file"
				accept=".xmp,.zip,application/zip"
				multiple
				hidden
				onChange={(event) => void handleImport(event.target.files)}
			/>
			<div className="flex flex-col gap-3 pb-4">
				<div className="relative">
					<Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
					<Input
						size="sm"
						className="pl-8"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search color presets"
					/>
				</div>
				<div className="scrollbar-hidden flex gap-1.5 overflow-x-auto pb-1">
					{categories.map((item) => (
						<Button
							key={item}
							size="sm"
							variant={category === item ? "secondary" : "outline"}
							className="shrink-0"
							onClick={() => setCategory(item)}
						>
							{item}
						</Button>
					))}
				</div>
				<div className="grid grid-cols-2 gap-2">
					{visible.map((preset) => {
						const isFavorite = favorites.includes(preset.id);
						return (
							<button
								key={preset.id}
								type="button"
								onClick={() => {
									setSelectedId(preset.id);
									preview({ preset });
								}}
								className={cn(
									"group overflow-hidden rounded-md border text-left transition-colors",
									selectedId === preset.id
										? "border-primary ring-1 ring-primary/30"
										: "border-border hover:border-foreground/30",
								)}
							>
								<div
									className="relative h-16"
									style={{
										background: `linear-gradient(135deg, ${preset.preview[0]}, ${preset.preview[1]} 55%, ${preset.preview[2]})`,
									}}
								>
									<Button
										size="icon"
										variant="secondary"
										className="absolute right-1 top-1 size-6"
										aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
										onClick={(event) => {
											event.stopPropagation();
											persistFavorites(
												isFavorite
													? favorites.filter((id) => id !== preset.id)
													: [...favorites, preset.id],
											);
										}}
									>
										<Heart
											className={cn(
												"size-3.5",
												isFavorite && "fill-current text-red-500",
											)}
										/>
									</Button>
								</div>
								<div className="flex items-center gap-1 px-2 py-1.5">
									<div className="min-w-0 flex-1">
										<p className="truncate text-xs font-medium">
											{preset.name}
										</p>
										<p className="text-muted-foreground truncate text-[10px]">
											{preset.category}
										</p>
									</div>
									{preset.source === "imported" && (
										<Button
											size="icon"
											variant="ghost"
											className="size-6 shrink-0"
											aria-label={`Delete ${preset.name}`}
											onClick={(event) => {
												event.stopPropagation();
												void remove(preset);
											}}
										>
											<Trash2 className="size-3.5" />
										</Button>
									)}
								</div>
							</button>
						);
					})}
				</div>
				{visible.length === 0 && (
					<div className="text-muted-foreground py-8 text-center text-sm">
						No presets found
					</div>
				)}
				<div className="bg-background sticky bottom-0 rounded-md border p-3 shadow-lg">
					<div className="mb-2 flex items-center justify-between text-xs">
						<span>Intensity</span>
						<span className="text-muted-foreground">{intensity}%</span>
					</div>
					<Slider
						value={[intensity]}
						min={0}
						max={100}
						step={1}
						onValueChange={([value]) => {
							const next = value ?? 100;
							setIntensity(next);
							if (selectedPreset)
								preview({ preset: selectedPreset, nextIntensity: next });
						}}
						onValueCommit={() => editor.timeline.commitPreview()}
					/>
					<div className="mt-3 grid grid-cols-2 gap-2">
						<Button
							size="sm"
							variant={scope === "selected" ? "secondary" : "outline"}
							onClick={() => {
								editor.timeline.discardPreview();
								setScope("selected");
							}}
						>
							Selected ({selectedTargetCount})
						</Button>
						<Button
							size="sm"
							variant={scope === "all" ? "secondary" : "outline"}
							onClick={() => {
								editor.timeline.discardPreview();
								setScope("all");
							}}
						>
							All clips
						</Button>
					</div>
					<div className="mt-2 flex gap-2">
						<Button
							size="sm"
							variant="outline"
							className="shrink-0"
							onClick={reset}
							title="Reset color"
						>
							<RotateCcw className="size-3.5" />
						</Button>
						<Button
							size="sm"
							className="flex-1"
							disabled={!selectedPreset}
							onClick={apply}
						>
							Apply {selectedPreset?.name ?? "preset"}
						</Button>
					</div>
				</div>
			</div>
		</PanelView>
	);
}
