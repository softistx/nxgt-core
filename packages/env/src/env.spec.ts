import { describe, expect, test } from 'bun:test';
import {
	checkEnv,
	classifyByName,
	generateValue,
	isPlaceholder,
	isTransportSafe,
	parseTemplate,
	parseValues,
	renderEnv,
} from './index';

const TEMPLATE = `# A stack's template
# @env secret length=48
SESSION_SECRET=

# @env manual — \`bun run register-client\` writes it
HYDRA_CLIENT_SECRET=

MONGO_PASSWORD=CHANGE_ME
NPM_TOKEN=
APP_URL=http://localhost:5190
# @env copy
LOOKS_LIKE_A_SECRET=not-really
`;

describe('classifyByName', () => {
	test('generates what only this deployment defines', () => {
		expect(classifyByName('SESSION_SECRET').kind).toBe('generate');
		expect(classifyByName('MONGO_PASSWORD').kind).toBe('generate');
		expect(classifyByName('COOKIE_SALT').kind).toBe('generate');
	});

	test('refuses to invent what something else issues', () => {
		for (const key of [
			'NPM_TOKEN',
			'GEMINI_API_KEY',
			'S3_ACCESS_KEY',
			'TLS_PRIVATE_KEY',
			'DATABASE_DSN',
		]) {
			expect(classifyByName(key).kind).toBe('manual');
		}
	});

	// The reason the manual list is checked first rather than last.
	test('_CLIENT_SECRET is manual although it ends in _SECRET', () => {
		const source = classifyByName('HYDRA_CLIENT_SECRET');
		expect(source.kind).toBe('manual');
		if (source.kind === 'manual') expect(source.reason).toContain('OAuth');
	});

	test('anything else is copied', () => {
		expect(classifyByName('APP_URL').kind).toBe('copy');
		expect(classifyByName('LOG_LEVEL').kind).toBe('copy');
	});
});

describe('generateValue', () => {
	test('a generated value survives a shell, a dotenv parser and compose', () => {
		for (let i = 0; i < 200; i++) {
			expect(isTransportSafe(generateValue('secret', 64))).toBe(true);
			expect(isTransportSafe(generateValue('password', 24))).toBe(true);
		}
	});

	test('lengths are honoured, and uuid/base64 have their own shape', () => {
		expect(generateValue('secret', 48)).toHaveLength(48);
		expect(generateValue('hex', 32)).toMatch(/^[0-9a-f]{32}$/);
		expect(generateValue('uuid', 36)).toMatch(/^[0-9a-f-]{36}$/);
		expect(atob(generateValue('base64', 32))).toHaveLength(32);
	});

	test('two calls do not collide', () => {
		const values = new Set(
			Array.from({ length: 500 }, () => generateValue('secret', 32)),
		);
		expect(values.size).toBe(500);
	});
});

describe('parseTemplate', () => {
	test('an annotation on the comment above the key wins over the name', () => {
		const { entries } = parseTemplate(TEMPLATE);
		const annotated = entries.find(
			(entry) => entry.key === 'LOOKS_LIKE_A_SECRET',
		);
		expect(annotated?.source.kind).toBe('copy');
		expect(annotated?.annotated).toBe(true);
		const session = entries.find((entry) => entry.key === 'SESSION_SECRET');
		expect(session?.source).toMatchObject({ kind: 'generate', length: 48 });
	});

	test('a blank line ends a comment block, so a header is not an annotation', () => {
		const { entries } = parseTemplate('# @env secret\n\nAPP_URL=x\n');
		expect(entries[0]?.annotated).toBe(false);
		expect(entries[0]?.source.kind).toBe('copy');
	});

	test('`export VAR=` lines are read too', () => {
		expect(parseValues('export A=1\nB=2\n').get('A')).toBe('1');
	});
});

describe('isPlaceholder', () => {
	test('the parc’s placeholder conventions count as empty', () => {
		for (const value of [
			'',
			'""',
			'CHANGE_ME',
			'change-me',
			'<cloudflare-token>',
			'TODO',
			'xxxx',
		]) {
			expect(isPlaceholder(value)).toBe(true);
		}
		expect(isPlaceholder('http://localhost:5190')).toBe(false);
	});
});

describe('renderEnv', () => {
	test('generates, leaves manual empty, copies the rest', () => {
		const result = renderEnv(parseTemplate(TEMPLATE));
		const values = parseValues(result.text);
		expect(values.get('SESSION_SECRET')).toHaveLength(48);
		expect(values.get('APP_URL')).toBe('http://localhost:5190');
		expect(values.get('LOOKS_LIKE_A_SECRET')).toBe('not-really');
		expect(values.get('HYDRA_CLIENT_SECRET')).toBe('');
		expect(result.generated.sort()).toEqual([
			'MONGO_PASSWORD',
			'SESSION_SECRET',
		]);
		expect(result.pending.sort()).toEqual(['HYDRA_CLIENT_SECRET', 'NPM_TOKEN']);
	});

	test('the template’s comments and order survive', () => {
		const result = renderEnv(parseTemplate(TEMPLATE));
		expect(result.text.split('\n')[0]).toBe("# A stack's template");
		expect(result.text).toContain('# @env manual');
	});

	// The property that makes it safe to run in a setup script every time.
	test('an existing value is never replaced, and a new key is filled alone', () => {
		const first = renderEnv(parseTemplate(TEMPLATE));
		const existing = parseValues(first.text);
		const second = renderEnv(parseTemplate(`${TEMPLATE}NEW_PASSWORD=\n`), {
			existing,
		});
		expect(parseValues(second.text).get('SESSION_SECRET')).toBe(
			existing.get('SESSION_SECRET'),
		);
		expect(second.generated).toEqual(['NEW_PASSWORD']);
		expect(second.kept).toContain('APP_URL');
	});

	test('rotate replaces one value and nothing else', () => {
		const first = renderEnv(parseTemplate(TEMPLATE));
		const existing = parseValues(first.text);
		const rotated = renderEnv(parseTemplate(TEMPLATE), {
			existing,
			rotate: ['SESSION_SECRET'],
		});
		const after = parseValues(rotated.text);
		expect(after.get('SESSION_SECRET')).not.toBe(
			existing.get('SESSION_SECRET'),
		);
		expect(after.get('MONGO_PASSWORD')).toBe(existing.get('MONGO_PASSWORD'));
	});
});

describe('checkEnv', () => {
	test('separates what is missing, empty, pending and unknown', () => {
		const env =
			'SESSION_SECRET=abc\nMONGO_PASSWORD=\nHYDRA_CLIENT_SECRET=\nSTRAY=1\n';
		const result = checkEnv(TEMPLATE, env);
		expect(result.missing).toEqual([
			'NPM_TOKEN',
			'APP_URL',
			'LOOKS_LIKE_A_SECRET',
		]);
		expect(result.empty).toEqual(['MONGO_PASSWORD']);
		expect(result.pending).toEqual(['HYDRA_CLIENT_SECRET']);
		expect(result.extra).toEqual(['STRAY']);
		expect(result.ok).toBe(false);
	});

	test('a rendered file checks out against its own template', () => {
		const rendered = renderEnv(parseTemplate(TEMPLATE)).text;
		const result = checkEnv(TEMPLATE, rendered);
		// The two manual keys are pending, not failures.
		expect(result.missing).toEqual([]);
		expect(result.empty).toEqual([]);
		expect(result.pending.sort()).toEqual(['HYDRA_CLIENT_SECRET', 'NPM_TOKEN']);
	});
});
