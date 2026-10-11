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
	/** Aborting it kills the process and ends the call at once (already aborted: nothing starts). */
	readonly signal?: AbortSignal;
	/** Start the process and return at once (code 0, empty output), without waiting for it. */
	readonly detached?: boolean;
}

export interface RunResult {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
	/** Set when the call was cut at its `timeoutMs` (code 143 or the like): a slow call, not a failed one. */
	readonly timedOut?: true;
}

export interface Runner {
	run(argv: readonly string[], options?: RunOptions): Promise<RunResult>;
	fetchJson(url: string, timeoutMs?: number): Promise<unknown>;
}

export const DEFAULT_TIMEOUT_MS = 10_000;
/** How long a killed child gets to report its exit code before the call returns without it. */
const KILL_GRACE_MS = 300;

/** A pipe read to the end in the background, which can be cut short and still say what arrived. */
function drain(stream: ReadableStream<Uint8Array>) {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	const done = (async () => {
		for (;;) {
			const { done: finished, value } = await reader.read();
			if (finished) return;
			chunks.push(value);
		}
	})().catch(() => undefined);
	return {
		done,
		cancel: () => reader.cancel().catch(() => undefined),
		text: () => new TextDecoder().decode(Buffer.concat(chunks)),
	};
}

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

/** SIGKILL to the child's whole process group (it leads its own), else to the child alone. */
function killGroup(child: Bun.Subprocess): void {
	try {
		process.kill(-child.pid, 'SIGKILL');
	} catch {
		child.kill('SIGKILL');
	}
}

const FORWARDED = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 } as const;
/** The children still running, so a signal to this process can reach them. */
const live = new Set<Bun.Subprocess>();
let forwarding = false;

/**
 * Once per process: on SIGINT, SIGTERM or SIGHUP kill every live child's
 * process group (each leads its own, so the default signal would orphan it),
 * then exit with the shell's 128 + n.
 */
function forwardSignals(): void {
	if (forwarding) return;
	forwarding = true;
	for (const [name, n] of Object.entries(FORWARDED)) {
		process.once(name, () => {
			for (const child of live) killGroup(child);
			process.exit(128 + n);
		});
	}
}

/**
 * The output and exit code of `child`, within `timeoutMs` and until `signal`
 * aborts. Past either, the child's process group is killed (a grandchild dies
 * with it) and the call returns what arrived so far without waiting for the
 * pipes. A call cut by the timeout, not by the signal, says `timedOut`.
 */
async function collect(
	child: Bun.Subprocess<'pipe' | 'ignore', 'pipe', 'pipe'>,
	timeoutMs: number,
	signal: AbortSignal | undefined,
): Promise<RunResult> {
	const stdout = drain(child.stdout);
	const stderr = drain(child.stderr);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onAbort: (() => void) | undefined;
	const cut = new Promise<'timeout' | 'abort'>((resolve) => {
		timer = setTimeout(() => resolve('timeout'), timeoutMs);
		onAbort = () => resolve('abort');
		signal?.addEventListener('abort', onAbort, { once: true });
	});
	try {
		const finished = Promise.all([stdout.done, stderr.done, child.exited]);
		const winner = await Promise.race([
			finished.then(([, , code]) => code),
			cut,
		]);
		if (typeof winner === 'number') {
			return { code: winner, stdout: stdout.text(), stderr: stderr.text() };
		}
		killGroup(child);
		await Promise.all([stdout.cancel(), stderr.cancel()]);
		const code = await Promise.race([child.exited, Bun.sleep(KILL_GRACE_MS)]);
		return {
			code: typeof code === 'number' ? code : 137,
			stdout: stdout.text(),
			stderr: stderr.text(),
			...(winner === 'timeout' ? { timedOut: true as const } : {}),
		};
	} finally {
		clearTimeout(timer);
		if (onAbort) signal?.removeEventListener('abort', onAbort);
	}
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
			if (options.signal?.aborted) {
				return { code: 1, stdout: '', stderr: 'aborted before it started' };
			}
			const child = Bun.spawn([...argv], {
				...(options.cwd ? { cwd: options.cwd } : {}),
				// Its own process group, so a timeout or an abort can kill the grandchildren too.
				detached: true,
				stdin: options.stdin === undefined ? 'ignore' : 'pipe',
				stdout: options.detached ? 'ignore' : 'pipe',
				stderr: options.detached ? 'ignore' : 'pipe',
			});
			if (options.detached) {
				child.unref();
				return { code: 0, stdout: '', stderr: '' };
			}
			forwardSignals();
			live.add(child);
			void child.exited.then(() => live.delete(child));
			if (options.stdin !== undefined && child.stdin) {
				child.stdin.write(options.stdin);
				await child.stdin.end();
			}
			return await collect(child, timeoutMs, options.signal);
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
