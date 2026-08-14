import type { Action } from 'svelte/action';

type DragState = {
	isDragging: boolean;
	offsetX: number;
	offsetY: number;
	pointerId: number;
	startClientX: number;
	startClientY: number;
};

export type DraggableDialogOptions = Readonly<{
	handleSelector: string;
}>;

const interactiveSelector = 'a, button, input, select, textarea, label, [contenteditable="true"]';
const dragThreshold = 4;
const viewportInset = 8;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

export const draggableDialog: Action<HTMLDialogElement, DraggableDialogOptions> = (dialog, initialOptions) => {
	let options = initialOptions;
	let dragState: DragState | null = null;

	function handlePointerDown(event: PointerEvent): void {
		if (dragState || event.button !== 0 || !(event.target instanceof Element)) {
			return;
		}

		const handle = event.target.closest(options.handleSelector);
		if (!handle || !dialog.contains(handle) || event.target.closest(interactiveSelector)) {
			return;
		}

		const bounds = dialog.getBoundingClientRect();
		dragState = {
			isDragging: false,
			offsetX: event.clientX - bounds.left,
			offsetY: event.clientY - bounds.top,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY
		};
	}

	function beginDrag(event: PointerEvent, state: DragState): void {
		const bounds = dialog.getBoundingClientRect();
		dialog.style.height = `${bounds.height}px`;
		dialog.style.inset = 'auto';
		dialog.style.left = `${bounds.left}px`;
		dialog.style.margin = '0';
		dialog.style.position = 'fixed';
		dialog.style.top = `${bounds.top}px`;
		dialog.style.width = `${bounds.width}px`;
		dialog.classList.add('is-dragging');
		dialog.setPointerCapture(event.pointerId);
		state.isDragging = true;
	}

	function handlePointerMove(event: PointerEvent): void {
		const state = dragState;
		if (!state || event.pointerId !== state.pointerId) {
			return;
		}

		if (!state.isDragging) {
			const distance = Math.hypot(event.clientX - state.startClientX, event.clientY - state.startClientY);
			if (distance < dragThreshold) {
				return;
			}
			beginDrag(event, state);
		}

		const bounds = dialog.getBoundingClientRect();
		const maximumLeft = Math.max(viewportInset, window.innerWidth - bounds.width - viewportInset);
		const maximumTop = Math.max(viewportInset, window.innerHeight - bounds.height - viewportInset);
		dialog.style.left = `${clamp(event.clientX - state.offsetX, viewportInset, maximumLeft)}px`;
		dialog.style.top = `${clamp(event.clientY - state.offsetY, viewportInset, maximumTop)}px`;
		event.preventDefault();
	}

	function finishDrag(event: PointerEvent): void {
		const state = dragState;
		if (!state || event.pointerId !== state.pointerId) {
			return;
		}

		if (state.isDragging && dialog.hasPointerCapture(event.pointerId)) {
			dialog.releasePointerCapture(event.pointerId);
		}
		dragState = null;
		dialog.classList.remove('is-dragging');
	}

	dialog.classList.add('is-draggable');
	dialog.addEventListener('pointerdown', handlePointerDown);
	dialog.addEventListener('pointermove', handlePointerMove);
	dialog.addEventListener('pointerup', finishDrag);
	dialog.addEventListener('pointercancel', finishDrag);

	return {
		update(nextOptions: DraggableDialogOptions): void {
			options = nextOptions;
		},
		destroy(): void {
			dialog.removeEventListener('pointerdown', handlePointerDown);
			dialog.removeEventListener('pointermove', handlePointerMove);
			dialog.removeEventListener('pointerup', finishDrag);
			dialog.removeEventListener('pointercancel', finishDrag);
			dialog.classList.remove('is-dragging', 'is-draggable');
		}
	};
};
