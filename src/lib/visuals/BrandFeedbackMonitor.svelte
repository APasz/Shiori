<script lang="ts">
	import { onMount } from 'svelte';
	import { brandIconFeedback, isBrandIconFeedbackState, type BrandIconFeedbackState } from './brand-feedback.svelte';

	const feedbackSelector = '[data-brand-feedback], [role="alert"], [role="status"]';

	function feedbackState(element: Element): BrandIconFeedbackState | null {
		const declaredState = element.getAttribute('data-brand-feedback');
		if (isBrandIconFeedbackState(declaredState)) {
			return declaredState;
		}

		if (element.getAttribute('role') === 'alert') {
			return 'error';
		}

		if (element.getAttribute('role') !== 'status') {
			return null;
		}

		if (element.classList.contains('success')) {
			return 'success';
		}
		if (element.classList.contains('warning')) {
			return 'warning';
		}
		if (element.classList.contains('error')) {
			return 'error';
		}

		return null;
	}

	function feedbackSignature(element: Element, state: BrandIconFeedbackState): string {
		return `${state}:${element.textContent?.trim() ?? ''}`;
	}

	onMount(() => {
		const reportedFeedback = new WeakMap<Element, string>();

		function report(element: Element): void {
			const state = feedbackState(element);
			if (state === null) {
				reportedFeedback.delete(element);
				return;
			}

			const signature = feedbackSignature(element, state);
			if (reportedFeedback.get(element) === signature) {
				return;
			}

			reportedFeedback.set(element, signature);
			brandIconFeedback.publish(state);
		}

		function inspect(node: Node): void {
			if (node instanceof Element) {
				if (node.matches(feedbackSelector)) {
					report(node);
				}
				node.querySelectorAll(feedbackSelector).forEach(report);
				return;
			}

			if (node.parentElement?.matches(feedbackSelector)) {
				report(node.parentElement);
			}
		}

		function synchronizeLoadingState(): void {
			const hasActiveLoader = document.querySelector('[data-brand-feedback="loading"]') !== null;
			if (hasActiveLoader && brandIconFeedback.state !== 'loading') {
				brandIconFeedback.publish('loading');
			} else if (!hasActiveLoader && brandIconFeedback.state === 'loading') {
				brandIconFeedback.clear();
			}
		}

		document.querySelectorAll(feedbackSelector).forEach(report);
		synchronizeLoadingState();

		const observer = new MutationObserver((records) => {
			for (const record of records) {
				if (record.type === 'attributes' && record.target instanceof Element) {
					report(record.target);
					continue;
				}

				if (record.type === 'characterData') {
					inspect(record.target);
					continue;
				}

				for (const node of record.addedNodes) {
					inspect(node);
				}
			}
			synchronizeLoadingState();
		});

		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ['class', 'data-brand-feedback', 'role'],
			characterData: true,
			childList: true,
			subtree: true
		});

		return () => observer.disconnect();
	});
</script>
