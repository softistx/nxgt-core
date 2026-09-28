import { describe, expect, it } from 'bun:test';
import { parse, print } from 'graphql';
import { CHECK_DIRECTIVE_SDL, PERMISSION_DIRECTIVE_SDL } from './sdl';

/**
 * The shipped `.graphqls` files are the source; the string exports are copies
 * for a schema assembled in code. Parsed and printed, the two must be the same
 * document — descriptions, defaults and all — or a consumer on one path gets a
 * different directive from a consumer on the other.
 */
const shipped = (name: string) =>
	Bun.file(
		new URL(`../../graphql/directives/${name}.graphqls`, import.meta.url),
	).text();

const normal = (sdl: string) => print(parse(sdl));

describe('the SDL strings', () => {
	it.each([
		['check', CHECK_DIRECTIVE_SDL],
		['permission', PERMISSION_DIRECTIVE_SDL],
	])('%s matches graphql/directives/%s.graphqls', async (name, sdl) => {
		expect(normal(sdl)).toBe(normal(await shipped(name)));
	});
});
