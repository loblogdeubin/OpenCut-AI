"use client";

import { useEffect, useState } from "react";
import { AudioItem } from "@/sounds/components/assets-view";
import { useSoundsStore } from "@/sounds/sounds-store";
import type { SoundEffect } from "@/sounds/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const CATEGORIES = [
	{ id: "whoosh", label: "Whoosh", query: "whoosh transition" },
	{ id: "impact", label: "Impact", query: "cinematic impact transition" },
	{ id: "riser", label: "Riser", query: "riser transition" },
	{ id: "glitch", label: "Glitch", query: "glitch transition" },
	{
		id: "cinematic",
		label: "Cinematic",
		query: "cinematic transition sound effect",
	},
	{ id: "trailer", label: "Trailer", query: "movie trailer transition boom" },
	{ id: "logo", label: "Logo Reveal", query: "logo reveal audio sting" },
	{ id: "ui", label: "UI", query: "interface ui transition click" },
	{ id: "horror", label: "Horror", query: "horror suspense transition sting" },
	{ id: "comedy", label: "Comedy", query: "comedy cartoon transition sound" },
	{ id: "nature", label: "Nature", query: "nature ambient transition sound" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

export function TransitionSoundsView() {
	const loadSavedSounds = useSoundsStore((state) => state.loadSavedSounds);
	const [categoryId, setCategoryId] = useState<CategoryId>("whoosh");
	const [sounds, setSounds] = useState<SoundEffect[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [playingId, setPlayingId] = useState<number | null>(null);
	const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
		null,
	);

	useEffect(() => {
		void loadSavedSounds();
	}, [loadSavedSounds]);

	useEffect(() => {
		const category = CATEGORIES.find((item) => item.id === categoryId);
		if (!category) return;
		const controller = new AbortController();

		const loadSounds = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const params = new URLSearchParams({
					q: category.query,
					type: "effects",
					page: "1",
					page_size: "30",
					commercial_only: "true",
				});
				const response = await fetch(
					`/api/sounds/search?${params.toString()}`,
					{
						signal: controller.signal,
					},
				);
				if (!response.ok) {
					throw new Error(`Gagal memuat audio (${response.status})`);
				}
				const data = (await response.json()) as { results?: SoundEffect[] };
				setSounds(data.results ?? []);
			} catch (loadError) {
				if (
					loadError instanceof DOMException &&
					loadError.name === "AbortError"
				) {
					return;
				}
				setError(
					loadError instanceof Error
						? loadError.message
						: "Gagal memuat audio transisi",
				);
			} finally {
				if (!controller.signal.aborted) setIsLoading(false);
			}
		};

		void loadSounds();
		return () => controller.abort();
	}, [categoryId]);

	useEffect(() => {
		return () => audioElement?.pause();
	}, [audioElement]);

	const playSound = ({ sound }: { sound: SoundEffect }) => {
		if (playingId === sound.id) {
			audioElement?.pause();
			setPlayingId(null);
			return;
		}
		audioElement?.pause();
		if (!sound.previewUrl) return;

		const audio = new Audio(sound.previewUrl);
		audio.addEventListener("ended", () => setPlayingId(null));
		audio.addEventListener("error", () => setPlayingId(null));
		void audio.play().catch(() => setPlayingId(null));
		setAudioElement(audio);
		setPlayingId(sound.id);
	};

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4">
			<div>
				<h2 className="text-sm font-semibold">Audio transisi</h2>
				<p className="text-xs text-muted-foreground">
					Preview, tambah ke playhead, atau simpan ke favorit.
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{CATEGORIES.map((category) => (
					<Button
						key={category.id}
						variant={categoryId === category.id ? "secondary" : "outline"}
						size="sm"
						onClick={() => setCategoryId(category.id)}
					>
						{category.label}
					</Button>
				))}
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-4 pr-2">
					{isLoading && (
						<p className="text-sm text-muted-foreground">Memuat audio…</p>
					)}
					{error && <p className="text-sm text-destructive">{error}</p>}
					{!isLoading && !error && sounds.length === 0 && (
						<p className="text-sm text-muted-foreground">
							Audio tidak ditemukan.
						</p>
					)}
					{sounds.map((sound) => (
						<AudioItem
							key={sound.id}
							sound={sound}
							isPlaying={playingId === sound.id}
							onPlay={playSound}
						/>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}
