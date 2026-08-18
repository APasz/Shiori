import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { formDataText } from '$lib/server/form-data';
import { loginRateLimiter } from '$lib/server/login-rate-limit';
import { hasBodySizeAtMost } from '$lib/server/request-size';
import { sessionCookieName, sessionCookieOptions } from '$lib/server/session';
import { authenticate, needsInitialSetup } from '$lib/server/store/auth';
import { createSession } from '$lib/server/store/sessions';

const maximumLoginRequestBytes = 16 * 1024;

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, '/');
	}

	return { setupRequired: await needsInitialSetup() };
};

export const actions: Actions = {
	default: async ({ cookies, getClientAddress, request, url }) => {
		if (!hasBodySizeAtMost(request, maximumLoginRequestBytes)) {
			return fail(413, { requestTooLarge: true });
		}
		const formData = await request.formData();
		const attempt = {
			clientAddress: getClientAddress(),
			username: formDataText(formData, 'username')
		};
		const allowance = loginRateLimiter.check(attempt);
		if (!allowance.allowed) {
			return fail(429, { retryAfterSeconds: allowance.retryAfterSeconds });
		}

		const user = await authenticate(attempt.username, formDataText(formData, 'password'));
		if (!user) {
			loginRateLimiter.recordFailure(attempt);
			return fail(400, { invalidCredentials: true });
		}
		loginRateLimiter.clear(attempt);

		const sessionId = await createSession(user.id);
		cookies.set(sessionCookieName, sessionId, sessionCookieOptions(url));
		redirect(303, '/');
	}
};
