import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;

describe('an encoder assigned to a credential name', () => {
	test.each([
		"const secret = new TextEncoder().encode('opensesame')",
		"const JWT_SECRET = new TextEncoder().encode('opensesame')",
		"secret: new TextEncoder().encode('opensesame'),",
		"const secretKey = Buffer.from('opensesame', 'utf8')",
		"const hmacKey = Buffer.from('letmeinplease')",
		"const token = btoa('opensesame')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'const secret = new TextEncoder().encode(process.env.JWT_SECRET)',
		"const greeting = new TextEncoder().encode('hello there')",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});
