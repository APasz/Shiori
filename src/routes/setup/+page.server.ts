import { dev } from '$app/environment';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { formDataText } from '$lib/server/form-data';
import { sessionCookieName, sessionCookieOptions } from '$lib/server/session';
import { setupTokenConfigurationError as configuredSetupTokenError } from '$lib/server/production-config';
import { createInitialSudo, needsInitialSetup } from '$lib/server/store/auth';
import { StoreError } from '$lib/server/store/error';
import { createSession } from '$lib/server/store/sessions';

function setupTokenConfigurationError(): string | null {
	return configuredSetupTokenError(process.env, !dev);
}

function setupTokenIsValid(token: string): boolean {
	const configuredToken = process.env.SHIORI_SETUP_TOKEN;
	if (dev && !configuredToken) {
		return true;
	}
	if (!configuredToken || setupTokenConfigurationError()) {
		return false;
	}

	const expectedDigest = createHash('sha256').update(configuredToken).digest();
	const receivedDigest = createHash('sha256').update(token).digest();
	return timingSafeEqual(expectedDigest, receivedDigest);
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user || !(await needsInitialSetup())) {
		redirect(303, '/');
	}

	return {
		setupTokenConfigurationError: setupTokenConfigurationError(),
		setupTokenRequired: !(dev && !process.env.SHIORI_SETUP_TOKEN)
	};
};

export const actions: Actions = {
	default: async ({ cookies, request, url }) => {
		const formData = await request.formData();
		const configurationError = setupTokenConfigurationError();
		if (configurationError) {
			return fail(503, { error: configurationError });
		}
		if (!setupTokenIsValid(formDataText(formData, 'setupToken'))) {
			return fail(403, { error: 'A valid setup token is required.' });
		}

		const password = formDataText(formData, 'password');
		if (password !== formDataText(formData, 'passwordConfirmation')) {
			return fail(400, { error: 'Passwords do not match.' });
		}

		try {
			const user = await createInitialSudo(formDataText(formData, 'username'), password);
			const sessionId = await createSession(user.id);
			cookies.set(sessionCookieName, sessionId, sessionCookieOptions(url));
		} catch (error: unknown) {
			if (error instanceof StoreError) {
				return fail(error.status, { error: error.message });
			}
			throw error;
		}

		redirect(303, '/');
	}
};
