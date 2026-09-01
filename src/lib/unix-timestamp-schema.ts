import { z } from 'zod';
import { unixEpochMilliseconds } from '$lib/itinerary/unix-time';

/** Validates a whole Unix-millisecond timestamp that JavaScript can represent as a Date. */
export const unixTimestampSchema = z
	.number()
	.int('Use a whole Unix-millisecond timestamp.')
	.min(unixEpochMilliseconds, 'Use a Unix-millisecond timestamp no earlier than the Unix epoch.')
	.max(8_640_000_000_000_000, 'Use a valid Unix-millisecond timestamp.');
