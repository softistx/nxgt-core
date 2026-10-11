import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;

describe('a spaced literal is a secret outside a message position', () => {
	test.each([
		"jwt.sign(p, 'This is my secret key 2024!')",
		"jwt.sign(payload, 'my secret')",
		"gatewaySecret('my gateway secret value')",
		"bcrypt.hash('correct horse battery staple', 10)",
		"createCipheriv('aes-256-gcm', 'my 32 byte key goes here now ok', iv)",
		"pbkdf2Sync(pw, 'my salt value', 1000, 32, 'sha256')",
		"expect(verifyPassword('correct horse', h)).toBe(true)",
		"setApiKey('k3y abc 123')",
		"bcrypt.compare('correct horse', hash)",
		"encode('my secret value')",
		"validateToken(token, 'Token has expired')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"verifyThing(signature, { description: 'Signature is invalid' })",
		"jwt.sign(p, key, { error: 'Could not sign it' })",
		"verifySignature(sig, { message: 'Bad signature here' })",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});

describe('role words, locales and env names are not keys', () => {
	test.each([
		"jwt.sign(p, 'admin')",
		"jwt.sign(p, 'abc')",
		"jwt.sign(p, 'DEV_SECRET')",
		"hashPassword('root')",
		"verifyPassword('admin', h)",
		"createHmac('sha256', 'refresh')",
		"login('alice', 'admin')",
		"login(page, 'admin', 'Admin123!')",
		"jwt.verify(token, 'user')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"login(page, 'admin')",
		"login('admin', password)",
		"compare(a, b, 'en')",
		"a.localeCompare(b, 'fr-CA', { sensitivity: 'base' })",
		"hash(input, 'sha3-256')",
		"createHmac('sha256', key)",
		"getSecret('JWT_SECRET')",
		"jwt.sign(payload, key, { algorithm: 'HS256', expiresIn: '1h' })",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});
