import { ZodError } from 'zod';

export function validationMessage(error: ZodError, fallback: string): string {
	return error.issues[0]?.message ?? fallback;
}
