import { describe, expect, it } from 'vitest';
import { operatorNameForServiceNumber, operatorNameForServicePrefix } from './transport-operator';

describe('transport operator recognition', () => {
	it('recognises a service prefix and formatted service numbers', () => {
		expect(operatorNameForServicePrefix('air', 'jq')).toBe('Jetstar');
		expect(operatorNameForServiceNumber('air', 'JQ13')).toBe('Jetstar');
		expect(operatorNameForServiceNumber('air', 'qf 650')).toBe('Qantas');
	});

	it('requires a numeric portion and does not cross transport-mode namespaces', () => {
		expect(operatorNameForServiceNumber('air', 'JQ')).toBeUndefined();
		expect(operatorNameForServiceNumber('rail', 'JQ13')).toBeUndefined();
		expect(operatorNameForServiceNumber('air', 'ZZ999')).toBeUndefined();
	});

	it.each([
		['QF 650', 'Qantas'],
		['VA 123', 'Virgin Australia'],
		['GK 200', 'Jetstar Japan'],
		['NH12', 'All Nippon Airways'],
		['SQ 228', 'Singapore Airlines'],
		['CX 138', 'Cathay Pacific'],
		['GA 421', 'Garuda Indonesia'],
		['EK406', 'Emirates'],
		['BA 15', 'British Airways'],
		['AF256', 'Air France'],
		['LH 247', 'Lufthansa'],
		['U2 8245', 'easyJet'],
		['FR 1234', 'Ryanair'],
		['W6 2311', 'Wizz Air']
	])('recognises Australia–Japan–Europe air services: %s', (serviceNumber, operator) => {
		expect(operatorNameForServiceNumber('air', serviceNumber)).toBe(operator);
	});

	it('resolves overlapping codes in their respective transport-mode namespaces', () => {
		expect(operatorNameForServiceNumber('air', 'GA 421')).toBe('Garuda Indonesia');
		expect(operatorNameForServiceNumber('rail', 'GA 123')).toBe('Greater Anglia');
	});

	it.each([
		['XPT 621', 'NSW TrainLink'],
		['V/Line 8130', 'V/Line'],
		['Nozomi 20', 'JR Central'],
		['Hayabusa 7', 'JR East / JR Hokkaido'],
		['LNER 1A01', 'LNER'],
		['Avanti 9M01', 'Avanti West Coast'],
		['Eurostar 9021', 'Eurostar'],
		['TGV INOUI 6123', 'SNCF Voyageurs'],
		['ICE 123', 'Deutsche Bahn'],
		['Nightjet 404', 'ÖBB'],
		['Frecciarossa 9520', 'Trenitalia'],
		['AVE 10234', 'Renfe'],
		['Amtrak 2150', 'Amtrak'],
		['KTX 101', 'Korail']
	])('recognises major rail services: %s', (serviceNumber, operator) => {
		expect(operatorNameForServiceNumber('rail', serviceNumber)).toBe(operator);
	});

	it('leaves generic service names unresolved to avoid incorrect international matches', () => {
		expect(operatorNameForServiceNumber('rail', 'IC 123')).toBeUndefined();
	});
});
