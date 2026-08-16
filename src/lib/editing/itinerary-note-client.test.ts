import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteItineraryNote, saveItineraryNote } from './itinerary-note-client';
import type { ItineraryNote } from '$lib/itinerary/schema';

const note: ItineraryNote = { entries: [], kind: 'trip', text: 'Bring a rail pass.', timeZone: 'UTC' };

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('itinerary note client', () => {
	it('sends a validated note save request', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ revision: 4 }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(saveItineraryNote({ endpoint: '/api/notes', note, revision: 3 })).resolves.toEqual({ success: true });
		expect(fetchMock).toHaveBeenCalledWith('/api/notes', {
			body: expect.any(String),
			headers: { 'content-type': 'application/json' },
			method: 'PUT'
		});
		const request = fetchMock.mock.calls[0][1] as RequestInit;
		expect(JSON.parse(String(request.body))).toEqual({ note, revision: 3 });
	});

	it('returns the API error message when deleting a note fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ message: 'The note was changed elsewhere.' }), { status: 409 })
				)
		);

		await expect(
			deleteItineraryNote({ endpoint: '/api/notes', revision: 3, target: { kind: 'trip' } })
		).resolves.toEqual({ error: 'The note was changed elsewhere.', success: false });
	});

	it('returns the appropriate unavailable message when saving cannot reach the server', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));

		await expect(saveItineraryNote({ endpoint: '/api/notes', note, revision: 3 })).resolves.toEqual({
			error: 'The note could not be saved because the server is unavailable.',
			success: false
		});
	});
});
