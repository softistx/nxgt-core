import { describe, expect, test } from 'bun:test';
import {
	identifierHoldsCredentialWord,
	namesCredential,
} from './credential-names';

/**
 * Two questions that used to share a name. Neither refuses a superset of the
 * other (this table is the proof), so they stay two functions with two names.
 */
const TABLE: [name: string, endsInCredential: boolean, holdsWord: boolean][] = [
	['password', true, true],
	['userPassword', true, true],
	['DB_PASSWORD', true, true],
	['apiKey', true, true],
	['accessToken', true, true],
	['x-gateway-secret', true, false],
	['x-api-key', true, false],
	['signingKey', true, false],
	['privateKey', true, false],
	['pwd', true, false],
	['DB_PASS', true, false],
	['authorization', true, false],
	['req.headers.authorization', true, false],
	['GATEWAY_SECRET_HEADER', false, true],
	['tokenType', false, true],
	['passwordStrength', false, true],
	['JWT_SECRET_FILE', false, true],
	['authHeader', false, true],
	['sessionId', false, true],
	['cookie', false, true],
	['headers.auth', false, true],
	['sortKey', false, false],
	['key', false, false],
	['author', false, false],
	['authorId', false, false],
	['title', false, false],
];

describe('the two credential-name questions', () => {
	test.each(TABLE)('%s', (name, ends, holds) => {
		expect(namesCredential(name)).toBe(ends);
		expect(identifierHoldsCredentialWord(name)).toBe(holds);
	});

	test('neither is stricter than the other', () => {
		expect(TABLE.some(([, ends, holds]) => ends && !holds)).toBe(true);
		expect(TABLE.some(([, ends, holds]) => holds && !ends)).toBe(true);
	});
});
