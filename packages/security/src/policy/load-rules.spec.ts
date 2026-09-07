import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	loadRawRulesFromEnv,
	loadRawRulesFromFile,
	loadRulesFromEnv,
	loadRulesFromFile,
	parseRules,
} from './load-rules';
import { evaluateRest } from './rest/evaluator';

describe('parseRules', () => {
	it('validates and precompiles in one call', async () => {
		const policy = parseRules({
			rest: { '/widgets': { GET: { authorities: [['ADMIN']] } } },
		});

		const result = await evaluateRest(policy, {
			type: 'rest',
			method: 'GET',
			path: '/widgets',
			claims: { sub: 'user-1', authorities: ['ADMIN'] },
		});
		expect(result.decision).toBe('ALLOW');
	});

	it('throws a Zod error for an invalid document', async () => {
		expect(() => parseRules({ rest: { '/widgets': { GTE: {} } } })).toThrow();
	});
});

describe('loadRulesFromFile / loadRulesFromEnv', () => {
	let dir: string;

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	it('reads, parses, and precompiles a YAML file from disk', async () => {
		dir = await mkdtemp(join(tmpdir(), 'security-rules-'));
		const path = join(dir, 'rules.yaml');
		await writeFile(
			path,
			'rest:\n  /widgets:\n    GET:\n      authorities: [["ADMIN"]]\n',
		);

		const policy = await loadRulesFromFile(path);
		const result = await evaluateRest(policy, {
			type: 'rest',
			method: 'GET',
			path: '/widgets',
			claims: { sub: 'user-1', authorities: ['ADMIN'] },
		});
		expect(result.decision).toBe('ALLOW');
	});

	it('loadRulesFromEnv prefers the env var over the fallback path', async () => {
		dir = await mkdtemp(join(tmpdir(), 'security-rules-'));
		const envPath = join(dir, 'from-env.yaml');
		const fallbackPath = join(dir, 'fallback.yaml');
		await writeFile(
			envPath,
			'rest:\n  /from-env:\n    GET:\n      authorities: []\n',
		);
		await writeFile(
			fallbackPath,
			'rest:\n  /fallback:\n    GET:\n      authorities: []\n',
		);

		process.env.TEST_RULES_FILE = envPath;
		try {
			const policy = await loadRulesFromEnv({
				envVar: 'TEST_RULES_FILE',
				fallbackPath,
			});
			expect(
				(
					await evaluateRest(policy, {
						type: 'rest',
						method: 'GET',
						path: '/from-env',
						claims: { sub: 'user-1' },
					})
				).decision,
			).toBe('ALLOW');
		} finally {
			delete process.env.TEST_RULES_FILE;
		}
	});

	it('loadRulesFromEnv falls back when the env var is unset', async () => {
		dir = await mkdtemp(join(tmpdir(), 'security-rules-'));
		const fallbackPath = join(dir, 'fallback.yaml');
		await writeFile(
			fallbackPath,
			'rest:\n  /fallback:\n    GET:\n      authorities: []\n',
		);
		delete process.env.TEST_RULES_FILE_UNSET;

		const policy = await loadRulesFromEnv({
			envVar: 'TEST_RULES_FILE_UNSET',
			fallbackPath,
		});
		expect(
			(
				await evaluateRest(policy, {
					type: 'rest',
					method: 'GET',
					path: '/fallback',
					claims: { sub: 'user-1' },
				})
			).decision,
		).toBe('ALLOW');
	});

	it('loadRulesFromEnv throws when neither the env var nor a fallback is given', async () => {
		delete process.env.TEST_RULES_FILE_UNSET;
		await expect(
			loadRulesFromEnv({ envVar: 'TEST_RULES_FILE_UNSET' }),
		).rejects.toThrow(/environment variable/i);
	});
});

describe('loadRawRulesFromFile / loadRawRulesFromEnv', () => {
	let dir: string;

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	it('reads and validates a YAML file from disk without compiling it', async () => {
		dir = await mkdtemp(join(tmpdir(), 'security-rules-'));
		const path = join(dir, 'rules.yaml');
		await writeFile(
			path,
			'rest:\n  /widgets:\n    GET:\n      authorities: [["ADMIN"]]\n',
		);

		const raw = await loadRawRulesFromFile(path);
		expect(raw).toEqual({
			rest: { '/widgets': { GET: { authorities: [['ADMIN']] } } },
		});
	});

	it('loadRawRulesFromEnv prefers the env var over the fallback path', async () => {
		dir = await mkdtemp(join(tmpdir(), 'security-rules-'));
		const envPath = join(dir, 'from-env.yaml');
		const fallbackPath = join(dir, 'fallback.yaml');
		await writeFile(
			envPath,
			'rest:\n  /from-env:\n    GET:\n      authorities: []\n',
		);
		await writeFile(
			fallbackPath,
			'rest:\n  /fallback:\n    GET:\n      authorities: []\n',
		);

		process.env.TEST_RULES_FILE = envPath;
		try {
			const raw = await loadRawRulesFromEnv({
				envVar: 'TEST_RULES_FILE',
				fallbackPath,
			});
			expect(raw.rest).toHaveProperty('/from-env');
		} finally {
			delete process.env.TEST_RULES_FILE;
		}
	});

	it('throws a Zod error for an invalid raw document', async () => {
		dir = await mkdtemp(join(tmpdir(), 'security-rules-'));
		const path = join(dir, 'rules.yaml');
		await writeFile(path, 'rest:\n  /widgets:\n    GTE: {}\n');

		await expect(loadRawRulesFromFile(path)).rejects.toThrow();
	});
});
