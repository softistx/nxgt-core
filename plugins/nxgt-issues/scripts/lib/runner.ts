/**
 * The only module of the plugin that spawns a process or reaches the network.
 * Everything else takes a `Runner` as a parameter, so a spec hands it the
 * scripted fake of `runner.fixtures.ts` and nothing real ever runs. Only an
 * entry file builds the real one; in a test run (`NODE_ENV=test`, or a `*.spec.ts` entry) it throws on every call
 * unless `NXGT_ISSUES_ALLOW_NETWORK=1`, so a spec that forgot the fake fails
 * loudly instead of calling `gh`.
 */

export interface RunOptions {
	readonly timeoutMs?: number;
	readonly stdin?: string;
	readonly cwd?: string;
}

export interface RunResult {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface Runner {
	run(argv: readonly string[], options?: RunOptions): Promise<RunResult>;
	fetchJson(url: string, timeoutMs?: number): Promise<unknown>;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

type Env = Record<string, string | undefined>;

const TEST_ENTRY = /\.(spec|test)\.[cm]?[jt]sx?$/;

/**
 * False in a test run unless `NXGT_ISSUES_ALLOW_NETWORK=1`. A test run is
 * `NODE_ENV=test` or an entry file named `*.spec.ts` / `*.test.ts`, so
 * `NODE_ENV=development bun test` does not slip past the guard.
 */
export function networkAllowed(env: Env, main: string = Bun.main): boolean {
	if (env['NXGT_ISSUES_ALLOW_NETWORK'] === '1') return true;
	return env['NODE_ENV'] !== 'test' && !TEST_ENTRY.test(main);
}

export function createRunner(
	env: Env = process.env,
	main: string = Bun.main,
): Runner {
	const guard = (what: string): void => {
		if (!networkAllowed(env, main)) {
			throw new Error(
				`nxgt-issues: ${what} is blocked in a test run; use the fake runner (or set NXGT_ISSUES_ALLOW_NETWORK=1).`,
			);
		}
	};
	return {
		async run(argv, options = {}) {
			guard(`running ${argv[0] ?? '(nothing)'}`);
			const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			const child = Bun.spawn([...argv], {
				...(options.cwd ? { cwd: options.cwd } : {}),
				stdin: options.stdin === undefined ? 'ignore' : 'pipe',
				stdout: 'pipe',
				stderr: 'pipe',
			});
			if (options.stdin !== undefined && child.stdin) {
				child.stdin.write(options.stdin);
				await child.stdin.end();
			}
			const timer = setTimeout(() => child.kill(), timeoutMs);
			try {
				const [stdout, stderr, code] = await Promise.all([
					new Response(child.stdout).text(),
					new Response(child.stderr).text(),
					child.exited,
				]);
				return { code, stdout, stderr };
			} finally {
				clearTimeout(timer);
			}
		},
		async fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
			guard(`fetching ${url}`);
			const response = await fetch(url, {
				signal: AbortSignal.timeout(timeoutMs),
				headers: { accept: 'application/json' },
			});
			if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
			return response.json();
		},
	};
}
