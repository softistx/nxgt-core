import { describe, expect, it } from 'bun:test';
import { translate } from './i18n';
import { MessageSyntaxError, parseMessage } from './parse';
import { resources } from './resources';

/**
 * An app that loads its catalogues from a database checks them without
 * depending on the ICU parser itself.
 */
describe('parseMessage', () => {
	it('answers a plain message with no arguments', () => {
		expect(parseMessage('Hello')).toEqual([]);
	});

	it('names each argument with its kind, in order of appearance', () => {
		expect(
			parseMessage(
				'{name} has {count, number} items, due {due, date, short} at {at, time}',
			),
		).toEqual([
			{ name: 'name', kind: 'argument' },
			{ name: 'count', kind: 'number' },
			{ name: 'due', kind: 'date' },
			{ name: 'at', kind: 'time' },
		]);
	});

	it('looks inside plural, selectordinal and select branches, and tags', () => {
		expect(
			parseMessage(
				'{n, plural, one {# file by {who}} other {# files}} {place, selectordinal, one {#st} other {#th}} {g, select, male {he} other {<b>{them}</b>}}',
			),
		).toEqual([
			{ name: 'n', kind: 'plural' },
			{ name: 'who', kind: 'argument' },
			{ name: 'place', kind: 'selectordinal' },
			{ name: 'g', kind: 'select' },
			{ name: 'b', kind: 'tag' },
			{ name: 'them', kind: 'argument' },
		]);
	});

	it('lists a name once per kind, so a name used two ways shows twice', () => {
		expect(parseMessage('{n} {n} {n, number}')).toEqual([
			{ name: 'n', kind: 'argument' },
			{ name: 'n', kind: 'number' },
		]);
	});

	it('throws a MessageSyntaxError that says where', () => {
		let caught: unknown;
		try {
			parseMessage('Hello {name');
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(MessageSyntaxError);
		expect(caught).toBeInstanceOf(SyntaxError);
		const error = caught as MessageSyntaxError;
		expect(error.code).toBe('EXPECT_ARGUMENT_CLOSING_BRACE');
		expect(error.source).toBe('Hello {name');
		expect([error.offset, error.line, error.column]).toEqual([6, 1, 7]);
		expect(error.name).toBe('MessageSyntaxError');
	});

	it('gives a refused skeleton a stable code and no made-up position', () => {
		let caught: unknown;
		try {
			parseMessage('Due {d, date, ::YYYY}');
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(MessageSyntaxError);
		const error = caught as MessageSyntaxError;
		expect(error.code).toBe('INVALID_SKELETON');
		expect([error.offset, error.line, error.column]).toEqual([
			undefined,
			undefined,
			undefined,
		]);
		expect(error.cause).toBeInstanceOf(Error);
	});

	it('refuses what the formatter refuses: a plural without other', () => {
		expect(() => parseMessage('{n, plural, one {#}}')).toThrow(
			MessageSyntaxError,
		);
	});

	it('parses every message this package ships', () => {
		const walk = (node: unknown): void => {
			if (typeof node === 'string') parseMessage(node);
			else for (const child of Object.values(node as object)) walk(child);
		};
		expect(() => walk(resources)).not.toThrow();
	});
});

describe('the package’s plural messages', () => {
	it('format instead of falling back to their raw text', () => {
		expect(
			translate(
				'validation.errors.email',
				{ path: 'mail', numberOfDomains: 1, domains: 'acme.test' },
				'en',
			),
		).toBe(
			"The value for the field 'mail' must be an email address within the domain 'acme.test'.",
		);
		expect(
			translate(
				'validation.errors.not-blank',
				{ path: 'nom', length: 0 },
				'fr',
			),
		).toBe("Le champ 'nom' ne doit pas être vide.");
	});
});
