import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;

describe('key material in plain and env-style key names', () => {
	test.each([
		"const key = 'Zq8w-LmP3-vTnR'",
		'LICENSE_KEY=ABCD-EFGH-1234-5678',
		'ACCESS_KEY=AbCdEfGhIjKlMnOp',
		'STRIPE_KEY=rk_abcdefghijklmnop',
		'S3_ACCESS_KEY=minioadmin',
		"const accessKeyId = 'minioadmin'",
		"const clientKey = 'qwertyuiopasdf'",
		"licenseKey: 'ABCD-EFGH-IJKL-MNOP'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'REDIS_KEY_PREFIX=app:',
		'CACHE_KEY_TTL=60',
		'API_KEY=<your-key>',
		"sortKey: 'createdAt'",
		"storageKey: 'theme-v2'",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});

describe('array flags', () => {
	test.each([
		"spawn('mysql', ['-u', 'root', '-p', 'hunter2'])",
		"execa('redis-cli', ['-a', 'hunter2', 'ping'])",
		"spawn('redis-cli', ['-a', '123456'])",
		"spawn('mysql', ['-u','root','-p','1234'])",
		"spawn('mysql', ['-u','root','-p1234'])",
		"spawn('mysql', ['-u','root','-phunter2'])",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"spawn('docker', ['run', '-p', '8080:80', 'img'])",
		"spawn('ssh', ['-p', '2222', 'host'])",
		"spawn('find', ['.', '-print'])",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});

describe('encoders take ordinary text', () => {
	test.each([
		"Buffer.from('hello world')",
		"new TextEncoder().encode('hello')",
		"encode('hello')",
		"encode('hello world')",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});

	test.each([
		"Buffer.from('admin:hunter2')",
		"Buffer.from('hunter2')",
		"new TextEncoder().encode('jwt-secret')",
		"btoa('admin:hunter2')",
		"jwt.sign(p, Buffer.from('hello'))",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});
