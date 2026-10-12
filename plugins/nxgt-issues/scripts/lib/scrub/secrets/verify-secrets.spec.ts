import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;

describe('spaced secrets in verify and compare calls', () => {
	test.each([
		"jwt.verify(token, 'my secret')",
		"jwtVerify(token, 'my secret')",
		"expect(verify(token, 'super secret key')).toBe(true)",
		"argon2.verify(hash, 'correct horse battery staple')",
		"verifyHmac(body, 'shared webhook secret')",
		"verifyWebhook(req, 'my webhook secret')",
		"verifySignature(payload, sig, 'whsec test secret')",
		"compare(input, 'correct horse battery')",
		"bcrypt.compareSync(input, 'open sesame please')",
		"validateSignature(body, 'mysecret')",
		// Accepted trade-off: prose in a verify call's positional argument refuses.
		"verify(signature, 'Signature is invalid')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"jwt.sign(p, key, { error: 'Could not sign it' })",
		"verifySignature(sig, { message: 'Bad signature here' })",
		"compare(a, b, 'en')",
		"jwt.sign(p, key, { jwtid: 'abc123', jti: 'r4nd0m' })",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});
