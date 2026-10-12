import { expect } from 'bun:test';
import { scrub } from '../scrub';

/** What the secrets specs share: every spec feeds `text` through `scrub` with no deny-list. */
export const refused = (text: string) => scrub(text, {}).refused;

export const secretsOf = (text: string) => scrub(text, {}).secrets;

/** `text` leaves `scrub` untouched and with no secret found. */
export const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
	});

/** Stricter than `passes`: the text must also not be refused. */
export const passesUnrefused = (text: string) =>
	expect({
		text,
		refused: refused(text),
		secrets: scrub(text, {}).secrets,
	}).toEqual({
		text,
		refused: false,
		secrets: [],
	});
