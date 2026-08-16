import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { maximumTripBackupBytes, maximumTripBackupSizeLabel, validateTripBackup } from '$lib/trip-backup';
import { storeErrorResponse } from '$lib/server/api';
import { importTripBackup } from '$lib/server/store/trips';

type BackupRequestBody =
	{ readonly body: unknown; readonly valid: true } | { readonly message: string; readonly valid: false };

async function readBackupRequestBody(request: Request): Promise<BackupRequestBody> {
	const contentLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > maximumTripBackupBytes) {
		return { message: `Choose a trip backup no larger than ${maximumTripBackupSizeLabel}.`, valid: false };
	}

	const body = request.body;
	if (!body) {
		return { message: 'Select a valid Shiori trip backup.', valid: false };
	}

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			byteLength += value.byteLength;
			if (byteLength > maximumTripBackupBytes) {
				await reader.cancel();
				return { message: `Choose a trip backup no larger than ${maximumTripBackupSizeLabel}.`, valid: false };
			}
			chunks.push(value);
		}
	} catch {
		return { message: 'Select a valid Shiori trip backup.', valid: false };
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	let source: string;
	try {
		source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return { message: 'Select a valid Shiori trip backup.', valid: false };
	}
	try {
		return { body: JSON.parse(source), valid: true };
	} catch {
		return { message: 'Select a valid Shiori trip backup.', valid: false };
	}
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = locals.user;
	if (!user) {
		return json({ message: 'Sign in to import a trip backup.' }, { status: 401 });
	}

	const requestBody = await readBackupRequestBody(request);
	if (!requestBody.valid) {
		return json({ message: requestBody.message }, { status: 400 });
	}

	const validation = validateTripBackup(requestBody.body);
	if (!validation.valid) {
		return json({ message: validation.message }, { status: 400 });
	}

	try {
		return json(await importTripBackup({ backup: validation.backup, ownerId: user.id }), { status: 201 });
	} catch (error: unknown) {
		return storeErrorResponse(error);
	}
};
