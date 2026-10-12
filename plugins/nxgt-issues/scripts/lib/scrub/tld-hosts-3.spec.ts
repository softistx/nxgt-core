import { describe, expect, test } from 'bun:test';
import { registrableDomain } from './deny-terms';
import { transform } from './scrub';

const t = (text: string) => transform(text, '/work/app').text;

describe('more TLDs and private suffixes', () => {
	test.each([
		'school.acme.education',
		'acme.africa',
		'portal.acme.ng',
		'acme.co.ke',
		'acme.co.za',
		'acme.in',
		'acme.sa and acme.ae and acme.qa',
		'acme.studio, acme.agency, acme.digital, acme.space',
		'acme.live, acme.so, acme.to',
		'db.prod.acme.lan',
		'billing.acme.internal',
		'acme.local',
	])('%p loses the name', (input) => {
		expect(t(input)).not.toContain('acme');
	});

	test.each([
		'expect(x).to.equal(1)',
		'theme.space[2]',
		'chrome.storage.local.get(k)',
		'chrome.storage.local',
		'for (const k in obj)',
		'this.live',
	])('%p is left alone', (input) => {
		expect(t(input)).toBe(input);
	});
});

test('co.za is a second-level suffix', () => {
	expect(registrableDomain('portal.acme.co.za')).toBe('acme.co.za');
});
