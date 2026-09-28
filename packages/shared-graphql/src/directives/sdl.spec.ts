import { describe, expect, it } from 'bun:test';
import { parse, print } from 'graphql';
import { PERMISSION_DIRECTIVE_SDL } from './sdl';

/**
 * The shipped `.graphqls` files are the source; the string exports are copies
 * for a schema assembled in code. Parsed and printed, the two must be the same
 * document — descriptions, defaults and all — or a consumer on one path gets a
 * different directive from a consumer on the other.
 */
const DIRECTIVES = new URL('../../graphql/directives/', import.meta.url);

const normal = (sdl: string) => print(parse(sdl));

describe('the SDL strings', () => {
	it('PERMISSION_DIRECTIVE_SDL matches graphql/directives/permission.graphqls', async () => {
		const shipped = await Bun.file(
			new URL('permission.graphqls', DIRECTIVES),
		).text();
		expect(normal(PERMISSION_DIRECTIVE_SDL)).toBe(normal(shipped));
	});

	it('ships no @check any more', async () => {
		const files = await Array.fromAsync(
			new Bun.Glob('*.graphqls').scan(DIRECTIVES.pathname),
		);
		expect(files).toEqual(['permission.graphqls']);
	});
});
