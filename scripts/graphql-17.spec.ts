import { describe, expect, it } from 'bun:test';
import { GRAPHQL_17, withGraphql } from './graphql-17';

describe('withGraphql', () => {
	it('moves only the graphql devDependency', () => {
		const manifest = {
			name: '@nxgt/shared-graphql',
			devDependencies: { graphql: '^16.4.2', '@types/bun': '^1.4.0' },
			peerDependencies: { graphql: '^16.4.2 || ^17.0.0' },
		};

		expect(withGraphql(manifest, GRAPHQL_17)).toEqual({
			...manifest,
			devDependencies: { graphql: GRAPHQL_17, '@types/bun': '^1.4.0' },
		});
		expect(manifest.devDependencies.graphql).toBe('^16.4.2');
	});

	it('refuses a manifest with no graphql devDependency, rather than testing nothing', () => {
		expect(() => withGraphql({ devDependencies: {} }, GRAPHQL_17)).toThrow(
			/no graphql devDependency/,
		);
	});
});
