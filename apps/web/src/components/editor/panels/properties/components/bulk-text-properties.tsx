"use client";

import { Section, SectionContent, SectionFields } from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { useEditor } from "@/editor/use-editor";
import {
	getElementParams,
	readElementParamValue,
	writeElementParamValue,
	type ElementParamDefinition,
} from "@/params/registry";
import type { ParamValue } from "@/params";
import type { SceneTracks, TextElement } from "@/timeline";

const BULK_TEXT_STYLE_KEYS = new Set([
	"fontFamily",
	"fontSize",
	"color",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"letterSpacing",
	"lineHeight",
	"background.enabled",
	"background.color",
	"background.cornerRadius",
	"background.paddingX",
	"background.paddingY",
	"background.offsetX",
	"background.offsetY",
]);

export function BulkTextProperties({
	elements,
}: {
	elements: Array<{ trackId: string; element: TextElement }>;
}) {
	const editor = useEditor();
	const primary = elements[0]?.element;
	if (!primary) return null;

	const params = getElementParams({ element: primary }).filter((param) =>
		BULK_TEXT_STYLE_KEYS.has(param.key),
	);

	const applyPreview = ({
		param,
		value,
	}: {
		param: ElementParamDefinition;
		value: ParamValue;
	}) => {
		const previewTracks = editor.timeline.getPreviewTracks();
		editor.timeline.previewElements({
			updates: elements.map(({ trackId, element }) => {
				const currentElement =
					findTextElement({
						tracks: previewTracks,
						trackId,
						elementId: element.id,
					}) ?? element;
				return {
					trackId,
					elementId: element.id,
					updates: writeElementParamValue({
						element: currentElement,
						param,
						value,
					}),
				};
			}),
		});
	};

	return (
		<div className="p-4">
			<p className="mb-1 text-sm font-medium">Edit subtitle bersama</p>
			<p className="mb-4 text-xs text-muted-foreground">
				Gaya diterapkan ke {elements.length} subtitle. Isi teks tiap subtitle
				tetap berbeda.
			</p>
			<Section sectionKey="bulk-text-style">
				<SectionContent className="pt-0">
					<SectionFields>
						{params.map((param) => {
							const value =
								readElementParamValue({ element: primary, param }) ??
								param.default;
							return (
								<PropertyParamField
									key={param.key}
									param={param}
									value={value}
									onPreview={(nextValue) =>
										applyPreview({ param, value: nextValue })
									}
									onCommit={() => editor.timeline.commitPreview()}
								/>
							);
						})}
					</SectionFields>
				</SectionContent>
			</Section>
		</div>
	);
}

function findTextElement({
	tracks,
	trackId,
	elementId,
}: {
	tracks: SceneTracks | null;
	trackId: string;
	elementId: string;
}): TextElement | undefined {
	if (!tracks) return undefined;
	const track = [...tracks.overlay, tracks.main, ...tracks.audio].find(
		(candidate) => candidate.id === trackId,
	);
	const element = track?.elements.find((candidate) => candidate.id === elementId);
	return element?.type === "text" ? element : undefined;
}
