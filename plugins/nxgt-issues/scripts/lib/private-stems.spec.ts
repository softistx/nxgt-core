import { describe, expect, test } from 'bun:test';
import { buildDenyList, findDenied } from './deny';
import { scrub } from './scrub';

/** Invented private repositories whose stems are common words, and one that is not. */
const list = buildDenyList({
	privateRepos: [
		'acme/acme-compose',
		'acme/rest-hub',
		'acme/content-studio',
		'acme/store-front',
		'acme/docker-tools',
		'acme/graphql-gateway',
		'acme/react-router-shell',
		'acme/nest-shop',
		'acme/spring-books',
		'acme/material-desktop',
		'acme/oauth-apollo',
		'acme/zorblax-api',
	],
});

const REPORT = `## Bug: rateLimiter from @nxgt/shared-hono rejects every request after a restart

Steps: call the route twice. The first request returns 200, the second 429
even though the window has passed. The rest is fine: headers are set, the store
is reached and the router still answers other routes.

\`\`\`
Content-Type: text/plain; charset=UTF-8
Error: Too many requests
    at rateLimiter (node_modules/@nxgt/shared-hono/dist/rate-limit.js:41:11)
    at async dispatch (node_modules/hono/dist/compose.js:22:17)
    at async cors (node_modules/hono/dist/middleware/cors/index.js:79:5)
    at async dispatch (node_modules/hono/dist/compose.js:22:17)
\`\`\`

Versions: hono 4.6, bun 1.2, docker compose with a redis store. The content of
the response is the default message. A react front end and a graphql client
see the same thing.`;

describe('private repository stems that are common words', () => {
	test.each([
		'at async dispatch (node_modules/hono/dist/compose.js:22:17)',
		'Content-Type: text/plain',
		'the rest is fine',
		'docker compose up with the redis store',
		'react router, graphql and apollo work; oauth too',
	])('%p passes', (text) => {
		expect(findDenied(text, list)).toEqual([]);
	});

	test('a realistic shared-hono rateLimiter report passes', () => {
		expect(findDenied(REPORT, list)).toEqual([]);
		expect(scrub(REPORT, { denyList: list }).denied).toEqual([]);
	});

	test.each([
		'the zorblax build broke',
		'ZorblaxApi',
		'ZORBLAX_URL=x',
		'zorblax-api',
	])('%p still refuses', (text) => {
		expect(findDenied(text, list)).not.toEqual([]);
	});

	test('full private names still refuse under node_modules', () => {
		expect(
			findDenied('at x (node_modules/rest-hub/dist/index.js:1:1)', list),
		).toEqual(['rest-hub']);
	});

	test('a distinctive stem inside a node_modules path is a public package path', () => {
		expect(findDenied('node_modules/zorblax/dist/index.js', list)).toEqual([]);
	});
});
