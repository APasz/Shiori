import { calendarDateSchema, isGoogleHotelPropertyUrl } from '$lib/itinerary/schema';

const maximumTravelStateLength = 20_000;
const maximumProtoDepth = 16;
const maximumRedirects = 5;
const requestTimeoutMilliseconds = 5_000;
const hexadecimalPattern = /^[0-9a-f]+$/i;
const entityTokenPattern = /^[A-Za-z0-9_-]{16,512}$/;
const knowledgeGraphIdPattern = /^\/g\/[A-Za-z0-9_-]+$/;
const coordinatesPattern = /ll(?:=|\\u003d)(-?(?:\d+(?:\.\d+)?|\.\d+)),(-?(?:\d+(?:\.\d+)?|\.\d+))/;

type ProtoField =
	| Readonly<{ fieldNumber: number; value: number; wireType: 0 }>
	| Readonly<{ fieldNumber: number; value: Uint8Array; wireType: 1 }>
	| Readonly<{ fieldNumber: number; value: Uint8Array; wireType: 2 }>
	| Readonly<{ fieldNumber: number; value: Uint8Array; wireType: 5 }>;

export type GoogleHotelsSearch = Readonly<{
	checkIn: string;
	checkOut: string;
	destination: string;
	selectedHotelEntityToken?: string;
}>;

export type GoogleHotelProperty = Readonly<{
	address: string;
	checkInTime?: string;
	checkOutTime?: string;
	coordinates?: Readonly<{ latitude: number; longitude: number }>;
	name: string;
}>;

export type ResolvedGoogleHotelProperty = Readonly<{
	checkInDate?: string;
	checkOutDate?: string;
	property: GoogleHotelProperty;
}>;

export class GoogleHotelPropertyResolveError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'GoogleHotelPropertyResolveError';
	}
}

function normalizedBase64(value: string): string | null {
	if (!/^[A-Za-z0-9_+-]+={0,2}$/.test(value)) {
		return null;
	}
	const unpadded = value.replaceAll('-', '+').replaceAll('_', '/').replace(/=+$/, '');
	return `${unpadded}${'='.repeat((4 - (unpadded.length % 4)) % 4)}`;
}

function decodeTravelState(value: string): Uint8Array | null {
	if (value.length === 0 || value.length > maximumTravelStateLength) {
		return null;
	}
	const normalized = normalizedBase64(value);
	if (!normalized) {
		return null;
	}
	try {
		return Buffer.from(normalized, 'base64');
	} catch {
		return null;
	}
}

function readVarint(bytes: Uint8Array, startIndex: number): Readonly<{ nextIndex: number; value: number }> | null {
	let value = 0;
	for (let index = startIndex; index < bytes.length && index < startIndex + 10; index += 1) {
		const byte = bytes[index];
		if (byte === undefined) {
			return null;
		}
		value += (byte & 0x7f) * 2 ** (7 * (index - startIndex));
		if ((byte & 0x80) === 0) {
			return { nextIndex: index + 1, value: Number.isSafeInteger(value) ? value : Number.NaN };
		}
	}
	return null;
}

function parseProtoFields(bytes: Uint8Array): ProtoField[] | null {
	const fields: ProtoField[] = [];
	for (let index = 0; index < bytes.length;) {
		const key = readVarint(bytes, index);
		if (!key || !Number.isSafeInteger(key.value) || key.value === 0) {
			return null;
		}
		index = key.nextIndex;
		const fieldNumber = Math.floor(key.value / 8);
		const wireType = key.value % 8;
		if (fieldNumber === 0 || (wireType !== 0 && wireType !== 1 && wireType !== 2 && wireType !== 5)) {
			return null;
		}

		if (wireType === 0) {
			const value = readVarint(bytes, index);
			if (!value) {
				return null;
			}
			fields.push({ fieldNumber, value: value.value, wireType });
			index = value.nextIndex;
			continue;
		}
		if (wireType === 1 || wireType === 5) {
			const byteLength = wireType === 1 ? 8 : 4;
			const endIndex = index + byteLength;
			if (endIndex > bytes.length) {
				return null;
			}
			fields.push({ fieldNumber, value: bytes.slice(index, endIndex), wireType });
			index = endIndex;
			continue;
		}

		const length = readVarint(bytes, index);
		if (!length || !Number.isSafeInteger(length.value) || length.value > bytes.length - length.nextIndex) {
			return null;
		}
		const endIndex = length.nextIndex + length.value;
		fields.push({ fieldNumber, value: bytes.slice(length.nextIndex, endIndex), wireType });
		index = endIndex;
	}
	return fields;
}

function calendarDateFromProto(fields: ProtoField[]): string | null {
	const values = new Map<number, number>();
	for (const field of fields) {
		if (field.wireType === 0 && (field.fieldNumber === 1 || field.fieldNumber === 2 || field.fieldNumber === 3)) {
			values.set(field.fieldNumber, field.value);
		}
	}
	const year = values.get(1);
	const month = values.get(2);
	const day = values.get(3);
	if (year === undefined || month === undefined || day === undefined) {
		return null;
	}
	const parsed = calendarDateSchema.safeParse(
		`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
	);
	return parsed.success ? parsed.data : null;
}

function dateRangeFromProto(fields: ProtoField[], depth = 0): Readonly<{ checkIn: string; checkOut: string }> | null {
	if (depth >= maximumProtoDepth) {
		return null;
	}
	for (const field of fields) {
		if (field.wireType !== 2) {
			continue;
		}
		const nested = parseProtoFields(field.value);
		if (!nested) {
			continue;
		}
		const dates = nested
			.filter((nestedField) => nestedField.wireType === 2)
			.map((nestedField) => parseProtoFields(nestedField.value))
			.map((dateFields) => (dateFields ? calendarDateFromProto(dateFields) : null))
			.filter((date): date is string => date !== null);
		const [checkIn, checkOut] = dates;
		if (dates.length === 2 && checkIn !== undefined && checkOut !== undefined && checkIn < checkOut) {
			return { checkIn, checkOut };
		}

		const nestedRange = dateRangeFromProto(nested, depth + 1);
		if (nestedRange) {
			return nestedRange;
		}
	}
	return null;
}

function destinationFromTravelState(bytes: Uint8Array): string | null {
	const travelStateBytes = Buffer.from(bytes);
	const travelState = travelStateBytes.toString('latin1');
	const destinations = new Set<string>();
	for (let locationStart = travelState.indexOf('2%0x'); locationStart !== -1;) {
		const locationTypeEnd = travelState.indexOf(':', locationStart);
		const locationIdEnd = locationTypeEnd === -1 ? -1 : travelState.indexOf(':', locationTypeEnd + 1);
		if (locationTypeEnd === -1 || locationIdEnd === -1) {
			break;
		}
		const locationType = travelState.slice(locationStart, locationTypeEnd);
		const locationId = travelState.slice(locationTypeEnd + 1, locationIdEnd);
		const nameLength = readVarint(travelStateBytes, locationIdEnd + 1);
		const nameEnd = nameLength ? nameLength.nextIndex + nameLength.value : -1;
		if (
			nameLength &&
			Number.isSafeInteger(nameLength.value) &&
			nameEnd <= travelStateBytes.length &&
			locationType.startsWith('2%0x') &&
			hexadecimalPattern.test(locationType.slice('2%0x'.length)) &&
			locationId.startsWith('0x') &&
			hexadecimalPattern.test(locationId.slice('0x'.length))
		) {
			const destination = travelStateBytes.subarray(nameLength.nextIndex, nameEnd).toString('utf8').trim();
			if (destination) {
				destinations.add(destination);
			}
		}
		locationStart = travelState.indexOf('2%0x', nameEnd > locationIdEnd ? nameEnd : locationIdEnd + 1);
	}
	return destinations.size === 1 ? ([...destinations][0] ?? null) : null;
}

function collectKnowledgeGraphIds(bytes: Uint8Array, ids: Set<string>, depth = 0): void {
	if (depth >= maximumProtoDepth) {
		return;
	}
	const fields = parseProtoFields(bytes);
	if (!fields) {
		return;
	}
	for (const field of fields) {
		if (field.wireType !== 2) {
			continue;
		}
		const id = Buffer.from(field.value).toString('utf8');
		if (knowledgeGraphIdPattern.test(id)) {
			ids.add(id);
		}
		collectKnowledgeGraphIds(field.value, ids, depth + 1);
	}
}

function knowledgeGraphIds(bytes: Uint8Array): Set<string> {
	const ids = new Set<string>();
	collectKnowledgeGraphIds(bytes, ids);
	return ids;
}

function hasKnowledgeGraphId(bytes: Uint8Array): boolean {
	return knowledgeGraphIds(bytes).size > 0;
}

/** Returns the one stable Knowledge Graph ID embedded in a Google Hotels entity token. */
export function knowledgeGraphIdFromHotelEntityToken(entityToken: string): string | null {
	const normalized = entityTokenPattern.test(entityToken) ? normalizedBase64(entityToken) : null;
	if (!normalized) {
		return null;
	}
	const ids = knowledgeGraphIds(Buffer.from(normalized, 'base64'));
	return ids.size === 1 ? ([...ids][0] ?? null) : null;
}

function entityTokenFromQueryState(bytes: Uint8Array, depth = 0): string | null {
	if (depth >= maximumProtoDepth) {
		return null;
	}
	const fields = parseProtoFields(bytes);
	if (!fields) {
		return null;
	}
	const tokens = new Set<string>();
	for (const field of fields) {
		if (field.wireType !== 2) {
			continue;
		}
		const candidate = Buffer.from(field.value).toString('ascii');
		const normalized = entityTokenPattern.test(candidate) ? normalizedBase64(candidate) : null;
		const entityBytes = normalized ? Buffer.from(normalized, 'base64') : null;
		if (entityBytes && hasKnowledgeGraphId(entityBytes)) {
			tokens.add(entityBytes.toString('base64url'));
		}

		const nestedToken = entityTokenFromQueryState(field.value, depth + 1);
		if (nestedToken) {
			tokens.add(nestedToken);
		}
	}
	return tokens.size === 1 ? ([...tokens][0] ?? null) : null;
}

function htmlText(value: string): string {
	return value
		.replace(/<[^>]*>/g, '')
		.replace(/&(amp|apos|gt|lt|quot);/gi, (_, entity: string) => {
			const entities: Readonly<Record<string, string>> = {
				amp: '&',
				apos: "'",
				gt: '>',
				lt: '<',
				quot: '"'
			};
			return entities[entity.toLowerCase()] ?? '';
		})
		.trim();
}

function coordinatesFromHtml(html: string): GoogleHotelProperty['coordinates'] | undefined {
	const match = html.match(coordinatesPattern);
	if (!match) {
		return undefined;
	}
	const latitude = Number(match[1]);
	const longitude = Number(match[2]);
	return Number.isFinite(latitude) &&
		Number.isFinite(longitude) &&
		latitude >= -90 &&
		latitude <= 90 &&
		longitude >= -180 &&
		longitude <= 180
		? { latitude, longitude }
		: undefined;
}

function addressFromHtml(html: string): string | null {
	const ariaLabelAddress = html.match(/aria-label="hotel address is ([^"]+)"/i)?.[1];
	if (ariaLabelAddress) {
		const address = htmlText(ariaLabelAddress);
		if (address) {
			return address;
		}
	}

	const headingEnd = html.search(/<\/h1\s*>/i);
	if (headingEnd === -1) {
		return null;
	}
	const propertyHeader = html.slice(headingEnd, headingEnd + 4_000);
	for (const match of propertyHeader.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)) {
		const candidate = htmlText(match[1] ?? '');
		if (candidate.length <= 500 && /\d/.test(candidate) && /[\p{L}]/u.test(candidate)) {
			return candidate;
		}
	}
	return null;
}

function localTimeFromHotelHtml(html: string, label: 'check-in' | 'check-out'): string | undefined {
	const match = html.match(new RegExp(`${label} time of\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)`, 'i'));
	if (!match) {
		return undefined;
	}
	const hour = Number(match[1]);
	const minute = Number(match[2] ?? '0');
	const period = match[3]?.toLowerCase();
	if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 12 || minute > 59) {
		return undefined;
	}
	const hour24 = period === 'am' ? hour % 12 : (hour % 12) + 12;
	return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Extracts the selected property's stable name, street address, and map coordinates from its Google Hotels page. */
export function parseGoogleHotelPropertyHtml(html: string): GoogleHotelProperty | null {
	const name = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
	const normalizedName = name ? htmlText(name) : '';
	const normalizedAddress = addressFromHtml(html) ?? '';
	if (!normalizedName || !normalizedAddress) {
		return null;
	}
	const coordinates = coordinatesFromHtml(html);
	const checkInTime = localTimeFromHotelHtml(html, 'check-in');
	const checkOutTime = localTimeFromHotelHtml(html, 'check-out');
	return {
		address: normalizedAddress,
		...(checkInTime ? { checkInTime } : {}),
		...(checkOutTime ? { checkOutTime } : {}),
		name: normalizedName,
		...(coordinates ? { coordinates } : {})
	};
}

function selectedHotelEntityUrl(searchUrl: URL, entityToken: string): URL {
	const url = new URL(`/travel/hotels/entity/${entityToken}`, searchUrl.origin);
	url.searchParams.set('hl', 'en');
	return url;
}

/** Returns the entity token from a canonical Google Hotels property URL. */
export function hotelEntityTokenFromPropertyUrl(url: URL): string | null {
	const entityToken = url.pathname.match(/^\/travel\/hotels\/entity\/([^/]+)$/)?.[1];
	return entityToken && entityTokenPattern.test(entityToken) ? entityToken : null;
}

async function fetchSelectedHotelPage(url: URL): Promise<Response | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		const response = await fetch(url, {
			headers: { 'accept-language': 'en' },
			redirect: 'manual',
			signal: controller.signal
		});
		return response.ok ? response : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchGoogleHotelPropertyPage(url: URL): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
	try {
		return await fetch(url, { headers: { 'accept-language': 'en' }, redirect: 'manual', signal: controller.signal });
	} catch {
		throw new GoogleHotelPropertyResolveError(502, 'Google Hotels could not be reached. Try again later.');
	} finally {
		clearTimeout(timeout);
	}
}

async function cancelResponseBody(response: Response): Promise<void> {
	await response.body?.cancel().catch(() => undefined);
}

function redirectGoogleHotelPropertyUrl(response: Response, currentUrl: URL): URL {
	const location = response.headers.get('location');
	if (!location) {
		throw new GoogleHotelPropertyResolveError(502, 'Google Hotels returned an invalid redirect.');
	}
	try {
		const redirectUrl = new URL(location, currentUrl);
		if (!isGoogleHotelPropertyUrl(redirectUrl.toString())) {
			throw new GoogleHotelPropertyResolveError(400, 'Google Hotels redirected to an unsupported address.');
		}
		return redirectUrl;
	} catch (error: unknown) {
		if (error instanceof GoogleHotelPropertyResolveError) {
			throw error;
		}
		throw new GoogleHotelPropertyResolveError(502, 'Google Hotels returned an invalid redirect.');
	}
}

/** Resolves a shareable Google Hotels property link, including Google's own short-link redirect. */
export async function resolveGoogleHotelPropertyUrl(inputUrl: string): Promise<ResolvedGoogleHotelProperty> {
	if (!isGoogleHotelPropertyUrl(inputUrl)) {
		throw new GoogleHotelPropertyResolveError(400, 'Use a Google Hotels property or share link.');
	}

	let currentUrl = new URL(inputUrl);
	for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
		const response = await fetchGoogleHotelPropertyPage(currentUrl);
		if (response.status >= 300 && response.status < 400) {
			try {
				if (redirectCount === maximumRedirects) {
					throw new GoogleHotelPropertyResolveError(502, 'Google Hotels redirected too many times.');
				}
				currentUrl = redirectGoogleHotelPropertyUrl(response, currentUrl);
			} finally {
				await cancelResponseBody(response);
			}
			continue;
		}

		if (!response.ok) {
			await cancelResponseBody(response);
			throw new GoogleHotelPropertyResolveError(502, 'Google Hotels could not resolve this property link.');
		}

		try {
			const property = parseGoogleHotelPropertyHtml(await response.text());
			if (!property) {
				throw new GoogleHotelPropertyResolveError(
					422,
					'Google Hotels did not include a usable property name and address.'
				);
			}
			const dates = parseGoogleHotelsStayDates(currentUrl);
			return {
				property,
				...(dates ? { checkInDate: dates.checkIn, checkOutDate: dates.checkOut } : {})
			};
		} finally {
			await cancelResponseBody(response);
		}
	}

	throw new GoogleHotelPropertyResolveError(502, 'Google Hotels redirected too many times.');
}

/** Resolves a selected Google Hotels entity without requiring a Google Places API key. */
export async function resolveGoogleHotelProperty(
	searchUrl: URL,
	entityToken: string
): Promise<GoogleHotelProperty | null> {
	const response = await fetchSelectedHotelPage(selectedHotelEntityUrl(searchUrl, entityToken));
	if (!response) {
		return null;
	}
	try {
		return parseGoogleHotelPropertyHtml(await response.text());
	} catch {
		return null;
	} finally {
		await response.body?.cancel().catch(() => undefined);
	}
}

/** Parses the destination and dates intentionally shared in a Google Hotels search URL. */
export function parseGoogleHotelsStayDates(url: URL): Readonly<{ checkIn: string; checkOut: string }> | null {
	const travelState = url.searchParams.get('ts');
	if (!travelState) {
		return null;
	}
	const bytes = decodeTravelState(travelState);
	const fields = bytes ? parseProtoFields(bytes) : null;
	return fields ? dateRangeFromProto(fields) : null;
}

export function parseGoogleHotelsSearch(url: URL): GoogleHotelsSearch | null {
	const travelState = url.searchParams.get('ts');
	if (!travelState) {
		return null;
	}
	const bytes = decodeTravelState(travelState);
	const dates = parseGoogleHotelsStayDates(url);
	const destination = bytes ? destinationFromTravelState(bytes) : null;
	const queryState = url.searchParams.get('qs');
	const queryStateBytes = queryState ? decodeTravelState(queryState) : null;
	const selectedHotelEntityToken = queryStateBytes ? entityTokenFromQueryState(queryStateBytes) : null;
	return dates && destination
		? { ...dates, destination, ...(selectedHotelEntityToken ? { selectedHotelEntityToken } : {}) }
		: null;
}
