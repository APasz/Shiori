import type { TransportDetails } from './schema';

type TransportMode = TransportDetails['mode'];

type ServiceOperator = Readonly<{
	code: string;
	name: string;
}>;

/**
 * Curated, mode-specific catalogue of service prefixes that Shiori can expand without guessing.
 * Codes are intentionally kept with the mode that owns their namespace.
 */
const serviceOperatorsByMode = {
	air: [
		{ code: 'QF', name: 'Qantas' },
		{ code: 'JQ', name: 'Jetstar' },
		{ code: 'VA', name: 'Virgin Australia' },
		{ code: 'NZ', name: 'Air New Zealand' },
		{ code: 'FJ', name: 'Fiji Airways' },
		{ code: 'SB', name: 'Aircalin' },
		{ code: 'PX', name: 'Air Niugini' },
		{ code: 'IE', name: 'Solomon Airlines' },

		{ code: 'JL', name: 'Japan Airlines' },
		{ code: 'NH', name: 'All Nippon Airways' },
		{ code: 'GK', name: 'Jetstar Japan' },
		{ code: 'MM', name: 'Peach Aviation' },
		{ code: 'BC', name: 'Skymark Airlines' },
		{ code: 'HD', name: 'AIRDO' },
		{ code: '6J', name: 'Solaseed Air' },
		{ code: '7C', name: 'Jeju Air' },
		{ code: 'KE', name: 'Korean Air' },
		{ code: 'LJ', name: 'Jin Air' },
		{ code: 'TW', name: "T'way Air" },
		{ code: 'CX', name: 'Cathay Pacific' },
		{ code: 'CI', name: 'China Airlines' },
		{ code: 'BR', name: 'EVA Air' },
		{ code: 'CA', name: 'Air China' },
		{ code: 'MU', name: 'China Eastern Airlines' },
		{ code: 'CZ', name: 'China Southern Airlines' },

		{ code: 'SQ', name: 'Singapore Airlines' },
		{ code: 'TR', name: 'Scoot' },
		{ code: 'MH', name: 'Malaysia Airlines' },
		{ code: 'D7', name: 'AirAsia X' },
		{ code: 'AK', name: 'AirAsia' },
		{ code: 'QZ', name: 'Indonesia AirAsia' },
		{ code: 'ID', name: 'Batik Air Indonesia' },
		{ code: 'OD', name: 'Batik Air Malaysia' },
		{ code: 'GA', name: 'Garuda Indonesia' },
		{ code: 'TG', name: 'Thai Airways' },
		{ code: 'XJ', name: 'Thai AirAsia X' },
		{ code: 'VJ', name: 'VietJet Air' },
		{ code: 'VN', name: 'Vietnam Airlines' },
		{ code: 'PR', name: 'Philippine Airlines' },
		{ code: '5J', name: 'Cebu Pacific' },
		{ code: 'BI', name: 'Royal Brunei Airlines' },
		{ code: 'UL', name: 'SriLankan Airlines' },

		{ code: 'BA', name: 'British Airways' },
		{ code: 'VS', name: 'Virgin Atlantic' },
		{ code: 'AF', name: 'Air France' },
		{ code: 'KL', name: 'KLM' },
		{ code: 'LH', name: 'Lufthansa' },
		{ code: 'LX', name: 'SWISS' },
		{ code: 'OS', name: 'Austrian Airlines' },
		{ code: 'AY', name: 'Finnair' },
		{ code: 'IB', name: 'Iberia' },
		{ code: 'VY', name: 'Vueling' },
		{ code: 'UX', name: 'Air Europa' },
		{ code: 'TP', name: 'TAP Air Portugal' },
		{ code: 'EI', name: 'Aer Lingus' },
		{ code: 'SK', name: 'Scandinavian Airlines' },
		{ code: 'LO', name: 'LOT Polish Airlines' },
		{ code: 'AZ', name: 'ITA Airways' },
		{ code: 'A3', name: 'Aegean Airlines' },
		{ code: 'JU', name: 'Air Serbia' },
		{ code: 'U2', name: 'easyJet' },
		{ code: 'FR', name: 'Ryanair' },
		{ code: 'W6', name: 'Wizz Air' },
		{ code: 'DY', name: 'Norwegian' },
		{ code: 'EW', name: 'Eurowings' },
		{ code: 'BT', name: 'airBaltic' },
		{ code: 'FI', name: 'Icelandair' },
		{ code: 'LS', name: 'Jet2' },
		{ code: 'HV', name: 'Transavia' },
		{ code: 'TO', name: 'Transavia France' },

		{ code: 'EK', name: 'Emirates' },
		{ code: 'QR', name: 'Qatar Airways' },
		{ code: 'EY', name: 'Etihad Airways' },
		{ code: 'TK', name: 'Turkish Airlines' }
	],
	bus: [],
	car: [],
	ferry: [],
	rail: [
		{ code: 'XPT', name: 'NSW TrainLink' },
		{ code: 'XPLORER', name: 'NSW TrainLink' },
		{ code: 'VLINE', name: 'V/Line' },
		{ code: 'THEGHAN', name: 'Journey Beyond Rail Expeditions' },
		{ code: 'INDIANPACIFIC', name: 'Journey Beyond Rail Expeditions' },
		{ code: 'OVERLAND', name: 'Journey Beyond Rail Expeditions' },

		{ code: 'NOZOMI', name: 'JR Central' },
		{ code: 'HIKARI', name: 'JR Central' },
		{ code: 'KODAMA', name: 'JR Central' },
		{ code: 'MIZUHO', name: 'JR West / JR Kyushu' },
		{ code: 'SAKURA', name: 'JR West / JR Kyushu' },
		{ code: 'TSUBAME', name: 'JR Kyushu' },
		{ code: 'HAYABUSA', name: 'JR East / JR Hokkaido' },
		{ code: 'HAYATE', name: 'JR East / JR Hokkaido' },
		{ code: 'YAMABIKO', name: 'JR East' },
		{ code: 'NASUNO', name: 'JR East' },
		{ code: 'KOMACHI', name: 'JR East' },
		{ code: 'TSUBASA', name: 'JR East' },
		{ code: 'TOKI', name: 'JR East' },
		{ code: 'KAGAYAKI', name: 'JR East / JR West' },
		{ code: 'HAKUTAKA', name: 'JR East / JR West' },
		{ code: 'ASAMA', name: 'JR East' },

		{ code: 'AVANTI', name: 'Avanti West Coast' },
		{ code: 'LNER', name: 'LNER' },
		{ code: 'GWR', name: 'Great Western Railway' },
		{ code: 'CROSSCOUNTRY', name: 'CrossCountry' },
		{ code: 'XC', name: 'CrossCountry' },
		{ code: 'EMR', name: 'East Midlands Railway' },
		{ code: 'TPE', name: 'TransPennine Express' },
		{ code: 'SWR', name: 'South Western Railway' },
		{ code: 'GA', name: 'Greater Anglia' },
		{ code: 'SCOTRAIL', name: 'ScotRail' },
		{ code: 'SR', name: 'ScotRail' },
		{ code: 'CALEDONIAN', name: 'Caledonian Sleeper' },
		{ code: 'CHILTERN', name: 'Chiltern Railways' },
		{ code: 'LUMO', name: 'Lumo' },
		{ code: 'GRANDCENTRAL', name: 'Grand Central' },
		{ code: 'GC', name: 'Grand Central' },
		{ code: 'HULLTRAINS', name: 'Hull Trains' },
		{ code: 'NORTHERN', name: 'Northern' },
		{ code: 'TFW', name: 'Transport for Wales' },
		{ code: 'SOUTHEASTERN', name: 'Southeastern' },
		{ code: 'SE', name: 'Southeastern' },
		{ code: 'C2C', name: 'c2c' },

		{ code: 'EUROSTAR', name: 'Eurostar' },
		{ code: 'THALYS', name: 'Eurostar' },
		{ code: 'TGVLYRIA', name: 'TGV Lyria' },
		{ code: 'TGVINOUI', name: 'SNCF Voyageurs' },
		{ code: 'TGV', name: 'SNCF Voyageurs' },
		{ code: 'OUIGO', name: 'SNCF Voyageurs' },
		{ code: 'ICE', name: 'Deutsche Bahn' },
		{ code: 'NIGHTJET', name: 'ÖBB' },
		{ code: 'RAILJET', name: 'ÖBB' },
		{ code: 'FRECCIAROSSA', name: 'Trenitalia' },
		{ code: 'FRECCIARGENTO', name: 'Trenitalia' },
		{ code: 'FRECCIABIANCA', name: 'Trenitalia' },
		{ code: 'ITALO', name: 'Italo' },
		{ code: 'AVE', name: 'Renfe' },
		{ code: 'AVLO', name: 'Renfe' },
		{ code: 'IRYO', name: 'Iryo' },
		{ code: 'SBB', name: 'SBB CFF FFS' },
		{ code: 'REGIOJET', name: 'RegioJet' },
		{ code: 'LEOEXPRESS', name: 'LEO Express' },
		{ code: 'PKPINTERCITY', name: 'PKP Intercity' },
		{ code: 'CD', name: 'České dráhy' },
		{ code: 'SJ', name: 'SJ' },
		{ code: 'VY', name: 'Vy' },

		{ code: 'AMTRAK', name: 'Amtrak' },
		{ code: 'ACELA', name: 'Amtrak' },
		{ code: 'VIA', name: 'VIA Rail Canada' },
		{ code: 'VANDEBHARAT', name: 'Indian Railways' },
		{ code: 'RAJDHANI', name: 'Indian Railways' },
		{ code: 'SHATABDI', name: 'Indian Railways' },
		{ code: 'KTX', name: 'Korail' },
		{ code: 'CRH', name: 'China Railway' },
		{ code: 'GAUTRAIN', name: 'Gautrain' }
	],
	'ride-share': [],
	walk: [],
	other: []
} as const satisfies Record<TransportMode, readonly ServiceOperator[]>;

function normalizedServicePrefix(value: string): string {
	return value.trim().toUpperCase();
}

function compactServiceNumber(value: string): string {
	return value
		.trim()
		.toUpperCase()
		.replaceAll(/[\s/-]/g, '');
}

function operatorsForMode(mode: TransportMode): readonly ServiceOperator[] {
	return serviceOperatorsByMode[mode];
}

/** Returns an operator name for an exact mode-specific carrier or service prefix. */
export function operatorNameForServicePrefix(mode: TransportMode, prefix: string): string | undefined {
	const normalizedPrefix = normalizedServicePrefix(prefix);
	return operatorsForMode(mode).find((operator) => operator.code === normalizedPrefix)?.name;
}

/** Returns an operator name only when a complete, mode-specific service number is recognised. */
export function operatorNameForServiceNumber(mode: TransportMode, serviceNumber: string): string | undefined {
	const compactNumber = compactServiceNumber(serviceNumber);
	return operatorsForMode(mode).find((operator) => {
		if (!compactNumber.startsWith(operator.code)) {
			return false;
		}
		return /^\d/.test(compactNumber.slice(operator.code.length));
	})?.name;
}
