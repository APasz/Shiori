import type { Action } from 'svelte/action';

type DragState = Readonly<{
	offsetX: number;
	offsetY: number;
	pointerId: number;
	startClientX: number;
	startClientY: number;
}>;

export type DraggableDialogOptions = Readonly<{
	canDismiss?: () => boolean;
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
	let suppressDismissalClick = false;

	function handlePointerDown(event: PointerEvent): void {
		if (event.button !== 0 || !(event.target instanceof Element)) {
			return;
		}

		const handle = event.target.closest(options.handleSelector);
		if (!handle || !dialog.contains(handle) || event.target.closest(interactiveSelector)) {
			return;
		}

		const bounds = dialog.getBoundingClientRect();
		dragState = {
			offsetX: event.clientX - bounds.left,
			offsetY: event.clientY - bounds.top,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY
		};
		dialog.style.height = `${bounds.height}px`;
		dialog.style.inset = 'auto';
		dialog.style.left = `${bounds.left}px`;
		dialog.style.margin = '0';
		dialog.style.position = 'fixed';
		dialog.style.top = `${bounds.top}px`;
		dialog.style.width = `${bounds.width}px`;
		dialog.classList.add('is-dragging');
		dialog.setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function handlePointerMove(event: PointerEvent): void {
		if (!dragState || event.pointerId !== dragState.pointerId) {
			return;
		}

		if (Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY) >= dragThreshold) {
			suppressDismissalClick = true;
		}

		const bounds = dialog.getBoundingClientRect();
		const maximumLeft = Math.max(viewportInset, window.innerWidth - bounds.width - viewportInset);
		const maximumTop = Math.max(viewportInset, window.innerHeight - bounds.height - viewportInset);
		dialog.style.left = `${clamp(event.clientX - dragState.offsetX, viewportInset, maximumLeft)}px`;
		dialog.style.top = `${clamp(event.clientY - dragState.offsetY, viewportInset, maximumTop)}px`;
	}

	function finishDrag(event: PointerEvent): void {
		if (!dragState || event.pointerId !== dragState.pointerId) {
			return;
		}

		if (dialog.hasPointerCapture(event.pointerId)) {
			dialog.releasePointerCapture(event.pointerId);
		}
		dragState = null;
		if (event.type === 'pointercancel') {
			suppressDismissalClick = false;
		}
		dialog.classList.remove('is-dragging');
	}

	function dismissWhenBackdropClicked(event: MouseEvent): void {
		if (suppressDismissalClick) {
			suppressDismissalClick = false;
			event.preventDefault();
			return;
		}
		if (event.target === dialog && (options.canDismiss?.() ?? true)) {
			dialog.close();
		}
	}

	dialog.classList.add('is-draggable');
	dialog.addEventListener('pointerdown', handlePointerDown);
	dialog.addEventListener('pointermove', handlePointerMove);
	dialog.addEventListener('pointerup', finishDrag);
	dialog.addEventListener('pointercancel', finishDrag);
	dialog.addEventListener('click', dismissWhenBackdropClicked);

	return {
		update(nextOptions: DraggableDialogOptions): void {
			options = nextOptions;
		},
		destroy(): void {
			dialog.removeEventListener('pointerdown', handlePointerDown);
			dialog.removeEventListener('pointermove', handlePointerMove);
			dialog.removeEventListener('pointerup', finishDrag);
			dialog.removeEventListener('pointercancel', finishDrag);
			dialog.removeEventListener('click', dismissWhenBackdropClicked);
			dialog.classList.remove('is-dragging', 'is-draggable');
		}
	};
};
