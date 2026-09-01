import { useCallback, useRef } from "react";
import { useEditor } from "@/editor/use-editor";
import type { ElementRef, SceneTracks } from "@/timeline/types";

type ElementSelectionMode = "replace" | "toggle" | "range";

function isSameElementRef({
	left,
	right,
}: {
	left: ElementRef;
	right: ElementRef;
}) {
	return left.trackId === right.trackId && left.elementId === right.elementId;
}

export function getElementRefsInTrackRange({
	tracks,
	anchor,
	target,
}: {
	tracks: SceneTracks;
	anchor: ElementRef;
	target: ElementRef;
}): ElementRef[] {
	if (anchor.trackId !== target.trackId) return [target];

	const track = [...tracks.overlay, tracks.main, ...tracks.audio].find(
		(candidate) => candidate.id === target.trackId,
	);
	if (!track) return [target];

	const orderedElements = [...track.elements].sort((left, right) => {
		const startTimeDifference = left.startTime - right.startTime;
		return startTimeDifference !== 0
			? startTimeDifference
			: left.id.localeCompare(right.id);
	});
	const anchorIndex = orderedElements.findIndex(
		(element) => element.id === anchor.elementId,
	);
	const targetIndex = orderedElements.findIndex(
		(element) => element.id === target.elementId,
	);
	if (anchorIndex === -1 || targetIndex === -1) return [target];

	const rangeStart = Math.min(anchorIndex, targetIndex);
	const rangeEnd = Math.max(anchorIndex, targetIndex);
	return orderedElements.slice(rangeStart, rangeEnd + 1).map((element) => ({
		trackId: target.trackId,
		elementId: element.id,
	}));
}

export function useElementSelection() {
	const editor = useEditor();
	const selectedElements = useEditor((e) => e.selection.getSelectedElements());
	const selectionAnchorRef = useRef<ElementRef | null>(null);

	const isElementSelected = useCallback(
		({ trackId, elementId }: ElementRef) =>
			selectedElements.some(
				(element) =>
					element.trackId === trackId && element.elementId === elementId,
			),
		[selectedElements],
	);

	const selectElement = useCallback(
		({ trackId, elementId }: ElementRef) => {
			editor.selection.setSelectedElements({
				elements: [{ trackId, elementId }],
			});
		},
		[editor],
	);

	const addElementToSelection = useCallback(
		({ trackId, elementId }: ElementRef) => {
			const alreadySelected = selectedElements.some(
				(element) =>
					element.trackId === trackId && element.elementId === elementId,
			);
			if (alreadySelected) return;

			editor.selection.setSelectedElements({
				elements: [...selectedElements, { trackId, elementId }],
			});
		},
		[selectedElements, editor],
	);

	const removeElementFromSelection = useCallback(
		({ trackId, elementId }: ElementRef) => {
			editor.selection.setSelectedElements({
				elements: selectedElements.filter(
					(element) =>
						!(element.trackId === trackId && element.elementId === elementId),
				),
			});
		},
		[selectedElements, editor],
	);

	const toggleElementSelection = useCallback(
		({ trackId, elementId }: ElementRef) => {
			const alreadySelected = selectedElements.some(
				(element) =>
					element.trackId === trackId && element.elementId === elementId,
			);

			if (alreadySelected) {
				removeElementFromSelection({ trackId, elementId });
			} else {
				addElementToSelection({ trackId, elementId });
			}
		},
		[selectedElements, addElementToSelection, removeElementFromSelection],
	);

	const clearElementSelection = useCallback(() => {
		editor.selection.clearSelection();
	}, [editor]);

	const setElementSelection = useCallback(
		({ elements }: { elements: ElementRef[] }) => {
			editor.selection.setSelectedElements({ elements });
		},
		[editor],
	);

	/**
	 * Merges elements into the current selection, deduplicating by identity.
	 * Used for additive box-select where the pre-drag selection is preserved.
	 */
	const mergeElementsIntoSelection = useCallback(
		({ elements }: { elements: ElementRef[] }) => {
			const merged = [
				...selectedElements.filter(
					(selectedElement) =>
						!elements.some(
							(element) =>
								element.trackId === selectedElement.trackId &&
								element.elementId === selectedElement.elementId,
						),
				),
				...elements,
			];
			editor.selection.setSelectedElements({ elements: merged });
		},
		[selectedElements, editor],
	);

	/**
	 * Handles click interaction on an element.
	 * - Regular click: select only this element
	 * - Ctrl/Cmd click: toggle this element in selection
	 * - Shift click: select every element between the anchor and target
	 */
	const handleElementClick = useCallback(
		({
			trackId,
			elementId,
			selectionMode,
		}: ElementRef & { selectionMode: ElementSelectionMode }) => {
			const target = { trackId, elementId };
			if (selectionMode === "range") {
				const storedAnchor = selectionAnchorRef.current;
				const anchor =
					storedAnchor &&
					selectedElements.some((selectedElement) =>
						isSameElementRef({ left: selectedElement, right: storedAnchor }),
					)
						? storedAnchor
						: (selectedElements[selectedElements.length - 1] ?? target);
				const elements = getElementRefsInTrackRange({
					tracks: editor.scenes.getActiveScene().tracks,
					anchor,
					target,
				});
				editor.selection.setSelectedElements({ elements });
				selectionAnchorRef.current = anchor;
				return;
			}

			selectionAnchorRef.current = target;
			if (selectionMode === "toggle") {
				toggleElementSelection(target);
				return;
			}
			selectElement(target);
		},
		[editor, selectedElements, toggleElementSelection, selectElement],
	);

	return {
		selectedElements,
		isElementSelected,
		selectElement,
		setElementSelection,
		mergeElementsIntoSelection,
		addElementToSelection,
		removeElementFromSelection,
		toggleElementSelection,
		clearElementSelection,
		handleElementClick,
	};
}
