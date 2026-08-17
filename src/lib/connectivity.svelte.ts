import { resolve } from '$app/paths';

export type ConnectivityStatus = 'checking' | 'reachable' | 'unreachable';

const probeIntervalMilliseconds = 30_000;
const probeTimeoutMilliseconds = 5_000;
const probeEndpoint = resolve('/api/health');

/** Maintains the current server reachability state for a page. */
export class ConnectivityMonitor {
	status = $state<ConnectivityStatus>('checking');
	#probeController: AbortController | null = null;

	start(): () => void {
		const checkConnection = (): void => {
			void this.check();
		};
		if (navigator.onLine) {
			checkConnection();
		} else {
			this.markUnavailable();
		}
		window.addEventListener('online', checkConnection);
		window.addEventListener('offline', this.markUnavailable);
		const probeIntervalId = window.setInterval(checkConnection, probeIntervalMilliseconds);

		return () => {
			this.#probeController?.abort();
			this.#probeController = null;
			window.clearInterval(probeIntervalId);
			window.removeEventListener('online', checkConnection);
			window.removeEventListener('offline', this.markUnavailable);
		};
	}

	private markUnavailable = (): void => {
		this.#probeController?.abort();
		this.#probeController = null;
		this.status = 'unreachable';
	};

	private async check(): Promise<void> {
		this.#probeController?.abort();
		const controller = new AbortController();
		this.#probeController = controller;
		const timeoutId = window.setTimeout(() => controller.abort(), probeTimeoutMilliseconds);

		try {
			const response = await fetch(probeEndpoint, {
				cache: 'no-store',
				headers: { 'cache-control': 'no-store' },
				signal: controller.signal
			});
			if (this.#probeController === controller) {
				this.status = response.ok ? 'reachable' : 'unreachable';
			}
		} catch {
			if (this.#probeController === controller) {
				this.status = 'unreachable';
			}
		} finally {
			window.clearTimeout(timeoutId);
			if (this.#probeController === controller) {
				this.#probeController = null;
			}
		}
	}
}
