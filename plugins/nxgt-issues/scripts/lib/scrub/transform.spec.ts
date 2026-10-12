import { describe, expect, test } from 'bun:test';
import { transform } from './scrub';

const cwd = '/Users/jane/work/secret-app';

describe('transform: paths', () => {
	test('a path under the cwd becomes <app>/…', () => {
		expect(transform(`at ${cwd}/src/a.ts:12:5`, cwd).text).toBe(
			'at <app>/src/a.ts:12:5',
		);
	});

	test('node_modules is kept from the last node_modules', () => {
		expect(
			transform(
				'at /Users/jane/work/secret-app/node_modules/@nxgt/x/dist/a.js',
				cwd,
			).text,
		).toBe('at node_modules/@nxgt/x/dist/a.js');
		expect(
			transform('/a/node_modules/b/node_modules/c/index.js', cwd).text,
		).toBe('node_modules/c/index.js');
	});

	test('any other absolute path is generic', () => {
		expect(transform('see /Users/jane/other/thing.ts for it', cwd).text).toBe(
			'see <app>/… for it',
		);
		expect(transform('(/home/jane/x/y)', undefined).text).toBe('(<app>/…)');
	});

	test('a Windows path', () => {
		expect(transform('at C:\\Users\\jane\\app\\a.ts', undefined).text).toBe(
			'at <app>/…',
		);
		expect(transform('C:\\app\\node_modules\\p\\i.js', undefined).text).toBe(
			'node_modules/p/i.js',
		);
	});

	test('relative paths, prose slashes and URLs are left to their own rules', () => {
		expect(transform('use src/a.ts and/or b', cwd).text).toBe(
			'use src/a.ts and/or b',
		);
		expect(
			transform('see https://github.com/softistx/nxgt-core/issues/1', cwd).text,
		).toBe('see https://github.com/softistx/nxgt-core/issues/1');
	});

	test('trailing punctuation stays outside the path', () => {
		expect(transform(`failed in ${cwd}/a.ts.`, cwd).text).toBe(
			'failed in <app>/a.ts.',
		);
	});
});

describe('transform: emails, urls, tokens', () => {
	test('emails', () => {
		const result = transform('mail jane.doe+x@example.co.uk now', cwd);
		expect(result.text).toBe('mail <email> now');
		expect(result.changes).toContain('email');
	});

	test('foreign urls go, github and npm stay', () => {
		expect(
			transform(
				'a https://internal.corp/x?y=1, b https://github.com/o/r c https://www.npmjs.com/package/p d https://registry.npmjs.org/p e http://localhost:3000/x',
				cwd,
			).text,
		).toBe(
			'a <url>, b https://github.com/o/r c https://www.npmjs.com/package/p d https://registry.npmjs.org/p e <url>',
		);
	});

	test('a lookalike host is foreign', () => {
		expect(transform('https://github.com.evil.io/x', cwd).text).toBe('<url>');
	});

	test.each([
		['ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
		['gho_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
		['github_pat_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
		['npm_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
		['AKIA' + 'ABCDEFGHIJKLMNOP'],
		['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fw'],
	])('token %p', (token) => {
		const result = transform(`key=${token} end`, cwd);
		expect(result.text).toBe('key=<token> end');
		expect(result.changes).toContain('token');
	});

	test('a long random-looking run is a token; ordinary long words are not', () => {
		expect(
			transform('x aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6 y', cwd).text,
		).toBe('x <token> y');
		expect(
			transform('supercalifragilisticexpialidocioushypothetically', cwd).text,
		).toBe('supercalifragilisticexpialidocioushypothetically');
		expect(transform('a'.repeat(40), cwd).text).toBe('a'.repeat(40));
	});

	test('a token inside a url is removed before the url is judged', () => {
		const result = transform(
			'https://github.com/o/r?token=ghp_a1B2c3D4e5F6g7H8i9J0k1L2',
			cwd,
		);
		expect(result.text).not.toContain('ghp_');
	});

	test('clean text is untouched and reports no change', () => {
		const result = transform('createThing([]) throws TypeError in v1.2.3', cwd);
		expect(result.text).toBe('createThing([]) throws TypeError in v1.2.3');
		expect(result.changes).toEqual([]);
	});
});

describe('transform: other schemes and credentials', () => {
	test.each([
		['redis://cache.internal:6379/0'],
		['mongodb+srv://u:p@cluster0.corp.net/db?x=1'],
		['ws://10.0.0.5:8080/socket'],
		['postgres://admin:pw@db.corp/app'],
		['ssh://git@git.corp/x.git'],
	])('%s becomes <url>', (url) => {
		expect(transform(`connect ${url} now`, cwd).text).toBe('connect <url> now');
	});

	test('userinfo is stripped from a kept host', () => {
		const out = transform('clone https://jane:hunter2@github.com/o/r.', cwd);
		expect(out.text).toBe('clone https://github.com/o/r.');
		expect(out.text).not.toMatch(/jane|hunter2/);
		expect(transform('https://tok@registry.npmjs.org/p', cwd).text).toBe(
			'https://registry.npmjs.org/p',
		);
		expect(transform('https://jane:p@ss@github.com/o/r', cwd).text).toBe(
			'https://github.com/o/r',
		);
	});

	test('file:// urls are paths', () => {
		expect(
			transform(`at file://${cwd}/src/a.ts and file:///Users/jane/x/y.ts`, cwd)
				.text,
		).toBe('at <app>/src/a.ts and <app>/…');
		expect(transform('file:///C:/Users/jane/app/a.ts', cwd).text).toBe(
			'<app>/…',
		);
	});

	test('a path after : or = starting at a known root, and ~/', () => {
		expect(transform('PATH=/opt/tools/bin:/home/jane/bin/x', cwd).text).toBe(
			'PATH=<app>/…:<app>/…',
		);
		expect(transform('cwd=/Users/jane/work/x', cwd).text).toBe('cwd=<app>/…');
		expect(transform('see ~/work/secret/x.ts', cwd).text).toBe('see <app>/…');
		expect(transform('a:/notaroot/x/y', cwd).text).toBe('a:/notaroot/x/y');
	});

	test('unicode path segments', () => {
		const out = transform('at /Users/jöhn/ünï/a.ts:3', cwd).text;
		expect(out).toBe('at <app>/…:3');
		expect(out).not.toContain('jöhn');
	});

	test('Windows paths with spaces lose the user directory', () => {
		for (const text of [
			'C:\\Users\\Jane Doe\\app\\a.ts',
			'at C:\\Users\\Jane Doe',
			'C:\\Users\\jane\\My Projects\\app\\a.ts failed',
		]) {
			const out = transform(text, undefined).text;
			expect(out).not.toMatch(/Jane|Doe|jane/);
			expect(out).toContain('<app>/…');
		}
		expect(
			transform('C:\\Users\\jane\\My Projects\\app\\a.ts failed', undefined)
				.text,
		).toBe('<app>/… failed');
	});
});

describe('transform: idempotence', () => {
	const corpus = [
		`at ${cwd}/src/a.ts:12:5`,
		'see /Users/jane/other/thing.ts for it',
		'C:\\Users\\Jane Doe\\app\\a.ts failed',
		'/a/node_modules/b/node_modules/c/index.js',
		'mail jane@example.com via https://internal.corp/x and https://github.com/o/r',
		'redis://h:6379 file:///Users/jane/x.ts ~/x/y PATH=/opt/a/b',
		'key=ghp_a1B2c3D4e5F6g7H8i9J0k1L2 aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6',
		'https://jane:hunter2@github.com/o/r and plain text, v1.2.3',
		`(${cwd}/a.ts), "${cwd}/b/c.ts".`,
		'db.corp:5432 10.0.0.1 ENOTFOUND x.lan /Users/Jane Doe/p/a.ts \\\\srv\\sh\\f',
		'git@gitlab.corp:t/r.git /api/v1/users/:id password: hunter2',
	];

	test.each(corpus)('%p', (text) => {
		const once = transform(text, cwd).text;
		expect(transform(once, cwd).text).toBe(once);
	});
});

describe('transform: git SHAs are kept', () => {
	const sha = '0123456789abcdef0123456789abcdef01234567';

	test('a 40-hex SHA and short SHAs survive', () => {
		expect(transform(`broken since ${sha}.`, cwd).text).toBe(
			`broken since ${sha}.`,
		);
		expect(transform(`fix-${sha} and ${sha}-x`, cwd).changes).toEqual([]);
		expect(transform('at d8dd6fd, 15c1c42ab3 and 0123456789ab', cwd).text).toBe(
			'at d8dd6fd, 15c1c42ab3 and 0123456789ab',
		);
	});

	test('a longer hex run, or a SHA glued to a secret, is still a token', () => {
		expect(transform(`${sha}${sha}`, cwd).text).toBe('<token>');
		expect(
			transform(`${sha}aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6`, cwd).text,
		).toBe('<token>');
	});
});

describe('transform: urls and routes', () => {
	test('a kept URL survives the entropy rule intact', () => {
		for (const url of [
			'https://github.com/softistx/nxgt-core/issues/123',
			'https://github.com/softistx/nxgt-core/pull/123/files',
			'https://www.npmjs.com/package/@nxgt/shared-hono-something/v/1.2.3',
		]) {
			expect(transform(`see ${url} now`, cwd).text).toBe(`see ${url} now`);
		}
	});

	test('a random run in a kept URL query is still a token', () => {
		const out = transform(
			'https://github.com/o/r?x=aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6',
			cwd,
		).text;
		expect(out).toBe('https://github.com/o/r?<token>');
	});

	test('routes survive; paths with a root, ~ or an extension do not', () => {
		for (const text of [
			'/api/v1/users/:id',
			'route /users/me/settings',
			'GET /api/v1/users/42 failed',
			'and/or /usr/local/bin/node',
		]) {
			expect(transform(text, cwd).text).toBe(text);
		}
		expect(transform('see /api/v1/openapi.json', cwd).text).toBe('see <app>/…');
		expect(transform('see ~/notes/todo', cwd).text).toBe('see <app>/…');
		expect(transform(`${cwd}/src/dir`, cwd).text).toBe('<app>/src/dir');
		expect(transform('see /home/jane/x/y', cwd).text).toBe('see <app>/…');
	});
});

describe('transform: more paths and remotes', () => {
	test('a POSIX home folder with a space', () => {
		const out = transform('at /Users/Jane Doe/proj/x.ts:3', cwd).text;
		expect(out).toBe('at <app>/…:3');
		expect(transform('/home/Jane Q Public/a', cwd).text).not.toMatch(
			/Jane|Public/,
		);
	});

	test('a UNC path', () => {
		expect(
			transform('open \\\\fileserver\\share\\team\\x.txt now', cwd).text,
		).toBe('open <app>/… now');
		expect(transform('a\\\\b\\c', cwd).text).toBe('a\\\\b\\c');
	});

	test('the scp form of a remote', () => {
		expect(
			transform('clone git@gitlab.internal.corp:team/billing-app.git', cwd)
				.text,
		).toBe('clone <url>');
		expect(transform('git@github.com:softistx/nxgt-core.git', cwd).text).toBe(
			'git@github.com:softistx/nxgt-core.git',
		);
		expect(transform('mail jane@example.com: hi', cwd).text).toBe(
			'mail <email>: hi',
		);
	});
});
