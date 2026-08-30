export const quickTimes = ['08:00', '10:00', '12:00', '15:00', '18:00', '21:00'] as const;

export type HourAdjustment = -1 | 1;

const localTimePattern = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/;

/** Returns whether a value is a complete local time suitable for the time picker. */
export function isLocalTime(value: string): boolean {
	return localTimePattern.test(value);
}

/** Adjusts a complete local time by one hour while preserving minutes and wrapping at midnight. */
export function adjustLocalTimeHour(value: string, adjustment: HourAdjustment): string | null {
	const matched = localTimePattern.exec(value);
	if (!matched?.groups) {
		return null;
	}

	const { hour, minute } = matched.groups;
	const adjustedHour = (Number(hour) + adjustment + 24) % 24;
	return `${adjustedHour.toString().padStart(2, '0')}:${minute}`;
}
